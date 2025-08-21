    const express = require('express');
    const path = require('path');
    const jyotish = require('jyotish-calculations');
    const geocoder = require('node-geocoder');

    const app = express();
    const port = process.env.PORT || 3000;

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // Geocoder configuration
    // IMPORTANT: A GEOLOCATION_API_KEY is required for the 'google' provider
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

    // Rasi names in Tamil (for building the chart)
    const RASI_NAMES_TAMIL = [
        'மேஷம்', 'ரிஷபம்', 'மிதுனம்', 'கடகம்', 'சிம்மம்', 'கன்னி',
        'துலாம்', 'விருச்சிகம்', 'தனுசு', 'மகரம்', 'கும்பம்', 'மீனம்'
    ];
    
    // Graha names in Tamil
    const GRAHA_NAMES_TAMIL = {
        'sun': 'சூரியன்', 'moon': 'சந்திரன்', 'mercury': 'புதன்',
        'venus': 'சுக்கிரன்', 'mars': 'செவ்வாய்', 'jupiter': 'குரு',
        'saturn': 'சனி', 'rahu': 'ராகு', 'ketu': 'கேது'
    };

    /**
     * Calculates the Lagna (Ascendant) based on birth date, time, and location.
     * @param {Date} birthDateTime - The birth date and time.
     * @param {object} location - The location object with latitude, longitude, and altitude.
     * @returns {number} - The Lagna Rasi index (0-11).
     */
    function calculateLagna(birthDateTime, location) {
        // CORRECTED: Call calculateAscendant directly on the jyotish object
        const lagnaInfo = jyotish.calculateAscendant(birthDateTime, location);
        const lagnaIndex = Math.floor(lagnaInfo.longitude / 30);
        return lagnaIndex;
    }

    /**
     * Generates a Tamil horoscope text and chart data.
     * @param {Date} birthDateTime - The birth date and time.
     * @param {object} location - The birth location object.
     * @returns {object} - An object containing the generated horoscope text, Lagna index, and planetary positions.
     */
    function generateHoroscope(birthDateTime, location) {
        // CORRECTED: Call calculatePositions directly on the jyotish object
        const planetPositions = jyotish.calculatePositions(birthDateTime, location);
        const lagnaIndex = calculateLagna(birthDateTime, location);

        let horoscopeText = `பிறந்த தேதி: ${birthDateTime.toLocaleDateString('ta-IN')} \n`;
        horoscopeText += `பிறந்த நேரம்: ${birthDateTime.toLocaleTimeString('ta-IN')} \n`;
        horoscopeText += `பிறந்த இடம்: ${location.formattedAddress || 'தெரியாத இடம்'} \n\n`;
        horoscopeText += `லக்னம்: ${RASI_NAMES_TAMIL[lagnaIndex]} \n\n`;
        horoscopeText += `கிரகங்களின் நிலைகள்: \n`;

        for (const graha in planetPositions) {
            const rasiIndex = Math.floor(planetPositions[graha].longitude / 30);
            const rasiName = RASI_NAMES_TAMIL[rasiIndex];
            const grahaName = GRAHA_NAMES_TAMIL[graha];
            horoscopeText += `${grahaName}: ${rasiName} \n`;
        }

        return {
            horoscopeText,
            lagna: lagnaIndex,
            planetPositions
        };
    }

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

    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
