/**
 * SKY CRED — config.js
 * Central configuration. The WeatherAPI key is a frontend key:
 * per the PRD (Security NFR), it is NOT treated as a secure secret.
 * It is also mirrored in .env for local reference.
 */
window.SKY_CRED_CONFIG = {
  // WeatherAPI.com (https://www.weatherapi.com/)
  WEATHER_API_KEY: 'abba2c2537104ed9a5095220261511',

  WEATHER_API_BASE_URL: 'https://api.weatherapi.com/v1/current.json',
  WEATHER_HISTORY_BASE_URL: 'https://api.weatherapi.com/v1/history.json',

  // Free, keyless city-photo source (Wikimedia Commons search, CORS-enabled)
  WIKIMEDIA_API_URL: 'https://commons.wikimedia.org/w/api.php',

  // FR-01.1 — Default city
  DEFAULT_CITY: 'Mumbai',

  // FR-03 — Popular cities
  POPULAR_CITIES: [
    'Mumbai',
    'Delhi',
    'Bengaluru',
    'Hyderabad',
    'Chennai',
    'Kolkata',
    'Pune',
    'Ahmedabad',
    'New York',
    'London'
  ]
};
