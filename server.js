    const express = require('express');
    const path = require('path');
    const jyotish = require('jyotish-calculations');
    const geocoder = require('node-geocoder');

    const app = express();
    const port = process.env.PORT || 3000;

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // Geocoder configuration
    const options = {
        provider: 'openstreetmap'
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
        // Lagna calculation is a complex process. This is a simplified approach
        // using the jyotish-calculations library to get the Ascendant.
        const lagnaInfo = jyotish.lagna.calculateAscendant(birthDateTime, location);
        // The library returns the Lagna as a zodiac sign object, which we convert to an index (0-11)
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
        // Calculate planetary positions
        const planetPositions = jyotish.grahas.calculatePositions(birthDateTime, location);

        // Calculate Lagna
        const lagnaIndex = calculateLagna(birthDateTime, location);

        // Build the horoscope text
        let horoscopeText = `பிறந்த தேதி: ${birthDateTime.toLocaleDateString('ta-IN')} \n`;
        horoscopeText += `பிறந்த நேரம்: ${birthDateTime.toLocaleTimeString('ta-IN')} \n`;
        horoscopeText += `பிறந்த இடம்: ${location.formattedAddress || 'தெரியாத இடம்'} \n\n`;
        horoscopeText += `லக்னம்: ${RASI_NAMES_TAMIL[lagnaIndex]} \n\n`;
        horoscopeText += `கிரகங்களின் நிலைகள்: \n`;

        // Determine which house each planet is in and add to the text
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

            // Step 1: Geocode the city to get latitude and longitude
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

            // Step 2: Parse birth date and time
            const birthDateTime = new Date(`${birthDate}T${birthTime}:00`);
            
            // Step 3: Generate the horoscope
            const horoscopeData = generateHoroscope(birthDateTime, location);

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

    // Serve the HTML file from the 'public' directory
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
