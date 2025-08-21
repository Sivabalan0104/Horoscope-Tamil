// server.js
const express = require('express');
const path = require('path');
// Import the 'jyotish' library, which should be installed via npm
const jyotish = require('jyotish');
const geocoder = require('node-geocoder');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON request bodies
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Geocoder configuration for location lookup
// NOTE: This requires a GEOLOCATION_API_KEY environment variable.
const GEOLOCATION_API_KEY = process.env.GEOLOCATION_API_KEY;

if (!GEOLOCATION_API_KEY) {
    console.error("GEOLOCATION_API_KEY environment variable is not set. The geocoding service will not work.");
    process.exit(1); // Exit the application if the key is missing
}

const options = {
    provider: 'google',
    apiKey: GEOLOCATION_API_KEY,
    formatter: null
};

const geo = geocoder(options);

// Rasi (zodiac sign) names in Tamil for chart display
const RASI_NAMES_TAMIL = [
    'மேஷம்', 'ரிஷபம்', 'மிதுனம்', 'கடகம்', 'சிம்மம்', 'கன்னி',
    'துலாம்', 'விருச்சிகம்', 'தனுசு', 'மகரம்', 'கும்பம்', 'மீனம்'
];

// Graha (planet) names in Tamil
const GRAHA_NAMES_TAMIL = {
    'sun': 'சூரியன்', 'moon': 'சந்திரன்', 'mercury': 'புதன்',
    'venus': 'சுக்கிரன்', 'mars': 'செவ்வாய்', 'jupiter': 'குரு',
    'saturn': 'சனி', 'rahu': 'ராகு', 'ketu': 'கேது'
};

/**
 * Calculates the Lagna (Ascendant) based on birth details.
 * @param {Date} birthDateTime - The birth date and time.
 * @param {object} location - The location object with latitude, longitude, and altitude.
 * @returns {number} - The Lagna Rasi index (0-11).
 */
function calculateAscendant(birthDateTime, location) {
    // Corrected: The 'getLagna' function is a direct method of the 'jyotish' module.
    const lagnaInfo = jyotish.getLagna(birthDateTime, location.latitude, location.longitude, 0);
    // Determine the Rasi index by dividing the longitude by 30 degrees
    const lagnaIndex = Math.floor(lagnaInfo.longitude / 30);
    return lagnaIndex;
}

/**
 * Gets planetary positions for the birth chart.
 * @param {Date} birthDateTime - The birth date and time.
 * @param {object} location - The birth location object.
 * @returns {object} - The planetary positions object from the 'jyotish' library.
 */
function getPlanetPositions(birthDateTime, location) {
    // Corrected: The 'getBirthChart' function is a direct method of the 'jyotish' module.
    return jyotish.getBirthChart(birthDateTime, location.latitude, location.longitude, 0);
}

/**
 * Generates a Tamil horoscope text and chart data.
 * @param {Date} birthDateTime - The birth date and time.
 * @param {object} location - The birth location object.
 * @returns {object} - An object containing the generated horoscope text, Lagna index, and planetary positions.
 */
function generateHoroscope(birthDateTime, location) {
    const planetPositions = getPlanetPositions(birthDateTime, location);
    const lagnaIndex = calculateAscendant(birthDateTime, location);

    // Build the horoscope text string in Tamil
    let horoscopeText = `பிறந்த தேதி: ${birthDateTime.toLocaleDateString('ta-IN')} \n`;
    horoscopeText += `பிறந்த நேரம்: ${birthDateTime.toLocaleTimeString('ta-IN')} \n`;
    horoscopeText += `பிறந்த இடம்: ${location.formattedAddress || 'தெரியாத இடம்'} \n\n`;
    horoscopeText += `லக்னம்: ${RASI_NAMES_TAMIL[lagnaIndex]} \n\n`;
    horoscopeText += `கிரகங்களின் நிலைகள்: \n`;

    // Iterate over the planets and add their positions to the text
    for (const graha in planetPositions.grahas) {
        const rasiIndex = Math.floor(planetPositions.grahas[graha].longitude / 30);
        const rasiName = RASI_NAMES_TAMIL[rasiIndex];
        const grahaName = GRAHA_NAMES_TAMIL[graha];
        horoscopeText += `${grahaName}: ${rasiName} \n`;
    }

    return {
        horoscopeText,
        lagna: lagnaIndex,
        planetPositions: planetPositions.grahas
    };
}

// Define the API endpoint to handle horoscope requests
app.post('/horoscope', async (req, res) => {
    try {
        const { birthDate, birthTime, birthPlace } = req.body;
        if (!birthDate || !birthTime || !birthPlace) {
            return res.status(400).json({ error: 'Missing birth data' });
        }

        const geoResult = await geo.geocode(birthPlace);
        if (!geoResult || geoResult.length === 0) {
            return res.status(404).json({ error: 'Could not find coordinates for the specified city.' });
        }
        const location = {
            latitude: geoResult[0].latitude,
            longitude: geoResult[0].longitude,
            altitude: 0,
            formattedAddress: geoResult[0].formattedAddress
        };

        const birthDateTime = new Date(`${birthDate}T${birthTime}:00`);
        const horoscopeData = generateHoroscope(birthDateTime, location);

        res.status(200).json({
            horoscopeText: horoscopeData.horoscopeText,
            lagna: horoscopeData.lagna,
            planetPositions: horoscopeData.planetPositions
        });
    } catch (error) {
        console.error('Error processing horoscope request:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Root endpoint to serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
