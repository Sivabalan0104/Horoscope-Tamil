// server.js
'use strict';

const express = require('express');
const path = require('path');
const geocoder = require('node-geocoder');

// Optional timezone libs (recommended)
// Add to package.json: "luxon": "^3.4.4", "geo-tz": "^6.0.2"
let DateTime;
let geoTz;
try {
  ({ DateTime } = require('luxon'));
} catch (e) {
  console.warn('luxon not installed; falling back to naive Date parsing (server timezone).');
}
try {
  geoTz = require('geo-tz');
} catch (e) {
  console.warn('geo-tz not installed; falling back to server timezone.');
}

// Load jyotish robustly (ESM/CJS)
let positioner;
let jy;
try {
  const mod = require('jyotish'); // supports both CJS/ESM
  jy = mod?.default || mod;
  positioner = jy?.positioner;
  console.log('jyotish loaded. positioner available:', !!positioner);
  if (positioner) {
    try { console.log('positioner methods:', Object.keys(positioner)); } catch (_) {}
  }
} catch (e) {
  console.error('Failed to load jyotish:', e);
}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Geocoder configuration
const GEOLOCATION_API_KEY = process.env.GEOLOCATION_API_KEY;
if (!GEOLOCATION_API_KEY) {
  console.error('GEOLOCATION_API_KEY is not set. Geocoding will not work.');
  // Uncomment to hard-fail boot if you want:
  // process.exit(1);
}
const geo = geocoder({
  provider: 'google',
  apiKey: GEOLOCATION_API_KEY,
  formatter: null
});

// Rasi and Graha names (Tamil)
const RASI_NAMES_TAMIL = [
  'மேஷம்', 'ரிஷபம்', 'மிதுனம்', 'கடகம்', 'சிம்மம்', 'கன்னி',
  'துலாம்', 'விருச்சிகம்', 'தனுசு', 'மகரம்', 'கும்பம்', 'மீனம்'
];

const GRAHA_NAMES_TAMIL = {
  sun: 'சூரியன்', moon: 'சந்திரன்', mercury: 'புதன்',
  venus: 'சுக்கிரன்', mars: 'செவ்வாய்', jupiter: 'குரு',
  saturn: 'சனி', rahu: 'ராகு', ketu: 'கேது'
};

// Helpers
function safePositionerMethod(name) {
  const fn = positioner && positioner[name];
  if (typeof fn !== 'function') {
    throw new Error(`Astrology engine missing: ${name} not found on jyotish.positioner`);
  }
  return fn;
}

function calculateAscendant(birthDateTime, location) {
  const getLagna = safePositionerMethod('getLagna');
  const lagnaInfo = getLagna(birthDateTime, location.latitude, location.longitude, 0);
  return Math.floor(lagnaInfo.longitude / 30);
}

function getPlanetPositions(birthDateTime, location) {
  const getBirthChart = safePositionerMethod('getBirthChart');
  return getBirthChart(birthDateTime, location.latitude, location.longitude, 0);
}

function resolveTimeZone(lat, lon) {
  try {
    if (geoTz && typeof geoTz.find === 'function') {
      const zones = geoTz.find(lat, lon);
      return zones && zones[0];
    }
  } catch (e) {
    console.warn('geo-tz lookup failed:', e.message);
  }
  return undefined;
}

function parseBirthDateTime(birthDate, birthTime, location) {
  // Returns { birthDateTime: Date, timeZone?: string }
  const timeZone = resolveTimeZone(location.latitude, location.longitude);
  if (DateTime && timeZone) {
    try {
      const local = DateTime.fromISO(`${birthDate}T${birthTime}`, { zone: timeZone });
      if (local.isValid) return { birthDateTime: local.toJSDate(), timeZone };
    } catch (e) {
      console.warn('Luxon parse failed; fallback to naive Date:', e.message);
    }
  }
  // Fallback: server timezone
  const naive = new Date(`${birthDate}T${birthTime}:00`);
  return { birthDateTime: naive, timeZone };
}

function formatDateTimeTamil(date, timeZone) {
  try {
    const opts = timeZone ? { timeZone } : undefined;
    const dateStr = date.toLocaleDateString('ta-IN', opts);
    const timeStr = date.toLocaleTimeString('ta-IN', opts);
    return { dateStr, timeStr };
  } catch {
    return { dateStr: date.toLocaleDateString('ta-IN'), timeStr: date.toLocaleTimeString('ta-IN') };
  }
}

function generateHoroscope(birthDateTime, location, timeZone) {
  const planetPositions = getPlanetPositions(birthDateTime, location);
  const lagnaIndex = calculateAscendant(birthDateTime, location);

  const { dateStr, timeStr } = formatDateTimeTamil(birthDateTime, timeZone);

  let horoscopeText = `பிறந்த தேதி: ${dateStr} \n`;
  horoscopeText += `பிறந்த நேரம்: ${timeStr} ${timeZone ? `(${timeZone})` : ''}\n`;
  horoscopeText += `பிறந்த இடம்: ${location.formattedAddress || 'தெரியாத இடம்'} \n\n`;
  horoscopeText += `லக்னம்: ${RASI_NAMES_TAMIL[lagnaIndex]} \n\n`;
  horoscopeText += `கிரகங்களின் நிலைகள்: \n`;

  if (planetPositions && planetPositions.grahas) {
    for (const graha in planetPositions.grahas) {
      const g = planetPositions.grahas[graha];
      if (!g || typeof g.longitude !== 'number') continue;
      const rasiIndex = Math.floor(g.longitude / 30);
      const rasiName = RASI_NAMES_TAMIL[(rasiIndex % 12 + 12) % 12];
      const grahaName = GRAHA_NAMES_TAMIL[graha] || graha;
      horoscopeText += `${grahaName}: ${rasiName} \n`;
    }
  } else {
    horoscopeText += 'தரவு கிடைக்கவில்லை.\n';
  }

  return {
    horoscopeText,
    lagna: lagnaIndex,
    planetPositions: planetPositions?.grahas || {}
  };
}

// API endpoint
app.post('/horoscope', async (req, res) => {
  try {
    if (!positioner) {
      return res.status(500).json({ error: 'Astrology engine unavailable (jyotish.positioner not found).' });
    }

    const { birthDate, birthTime, birthPlace } = req.body || {};
    if (!birthDate || !birthTime || !birthPlace) {
      return res.status(400).json({ error: 'Missing birth data (birthDate, birthTime, birthPlace are required).' });
    }

    const geoResult = await geo.geocode(birthPlace);
    if (!geoResult || geoResult.length === 0) {
      return res.status(404).json({ error: 'Could not find coordinates for the specified place.' });
    }

    const best = geoResult[0];
    const location = {
      latitude: best.latitude,
      longitude: best.longitude,
      altitude: 0,
      formattedAddress: best.formattedAddress || birthPlace
    };

    const { birthDateTime, timeZone } = parseBirthDateTime(birthDate, birthTime, location);
    const horoscopeData = generateHoroscope(birthDateTime, location, timeZone);

    res.status(200).json({
      horoscopeText: horoscopeData.horoscopeText,
      lagna: horoscopeData.lagna,
      planetPositions: horoscopeData.planetPositions
    });
  } catch (error) {
    console.error('Error processing horoscope request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Root
app.get('/debug', (req, res) => {
  res.json({
    ok: true,
    positionerAvailable: !!positioner,
    positionerMethods: positioner ? Object.keys(positioner) : [],
    geocoderProvider: 'google',
    hasGeoApiKey: !!GEOLOCATION_API_KEY,
    timezoneLibs: { luxon: !!DateTime, geoTz: !!geoTz }
  });
});

// Start server
const portEnv = process.env.PORT || 3000;
app.listen(portEnv, () => {
  console.log(`Server running at http://localhost:${portEnv}`);
});
