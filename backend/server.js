const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.WEATHER_API_KEY;

if (!API_KEY) {
  console.error('❌ Missing WEATHER_API_KEY in environment variables');
  process.exit(1);
}

// 🌍 City aliases
const cityMappings = {
  'bengaluru': 'Bangalore',
  'bangalore': 'Bangalore',
  'mumbai': 'Mumbai',
  'bombay': 'Mumbai',
  'chennai': 'Chennai',
  'madras': 'Chennai',
  'nyc': 'New York',
  'new york city': 'New York',
  'sf': 'San Francisco',
  'san fran': 'San Francisco',
  'delhi': 'Delhi',
  'new delhi': 'New Delhi'
};

function standardizeCityName(city) {
  const lowerCity = city.toLowerCase().trim();
  return cityMappings[lowerCity] || city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
}

// 📦 Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('json spaces', 2);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// 🛡️ Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// 🏠 Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🌤️ Weather API
app.get('/weather', async (req, res) => {
  try {
    const city = req.query.city?.trim();

    if (!city) {
      return res.status(400).json({
        error: 'City parameter is required',
        example: '/weather?city=London',
        available_aliases: Object.entries(cityMappings)
      });
    }

    const standardizedCity = standardizeCityName(city);
    console.log(`🔍 Fetching weather for: ${standardizedCity}`);

    const [currentRes, forecastRes] = await Promise.all([
      axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          q: standardizedCity,
          appid: API_KEY,
          units: 'metric',
          lang: 'en'
        },
        timeout: 5000
      }),
      axios.get('https://api.openweathermap.org/data/2.5/forecast', {
        params: {
          q: standardizedCity,
          appid: API_KEY,
          units: 'metric',
          cnt: 6,
          lang: 'en'
        },
        timeout: 5000
      })
    ]);

    if (!currentRes.data?.main || !forecastRes.data?.list) {
      throw new Error('Incomplete weather data received from API');
    }

    const responseData = {
      city: standardizedCity,
      current: {
        ...currentRes.data,
        main: {
          temp: Math.round(currentRes.data.main.temp),
          feels_like: Math.round(currentRes.data.main.feels_like),
          humidity: currentRes.data.main.humidity,
          pressure: currentRes.data.main.pressure,
          ...currentRes.data.main
        },
        weather: currentRes.data.weather.map(w => ({
          ...w,
          description: w.description.charAt(0).toUpperCase() + w.description.slice(1)
        })),
        wind: {
          speed: currentRes.data.wind.speed,
          deg: currentRes.data.wind.deg || 0
        }
      },
      forecast: forecastRes.data.list.map(item => ({
        dt_txt: item.dt_txt,
        main: {
          temp: Math.round(item.main.temp),
          feels_like: Math.round(item.main.feels_like)
        },
        weather: item.weather.map(w => ({
          ...w,
          description: w.description.charAt(0).toUpperCase() + w.description.slice(1)
        }))
      })),
      timestamp: new Date().toISOString()
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Error:', error.message);

    let status = 500;
    let message = 'Error fetching weather data';

    if (error.response) {
      status = error.response.status;
      if (error.response.data?.cod === '404') {
        message = `City "${req.query.city}" not found. Try another location.`;
      } else {
        message = error.response.data?.message || 'Weather API error';
      }
    } else if (error.code === 'ECONNABORTED') {
      message = 'Request to weather service timed out';
    }

    res.status(status).json({
      error: message,
      suggestion: 'Try checking the city name or try again later'
    });
  }
});

// ❓ 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available_endpoints: {
      weather: '/weather?city={city_name}'
    }
  });
});

// ⚠️ Error handler
app.use((err, req, res, next) => {
  console.error('⚠️ Server Error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`✅ Weather API running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});

// 🔥 Graceful error handling
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
