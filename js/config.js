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

  // FR-01.1 — Default city (per product owner: Delhi, India)
  DEFAULT_CITY: 'Delhi, India',

  // FR-03 — Popular cities (label shown, query sent; Indian cities are
  // disambiguated because namesakes exist abroad, e.g. Delhi/Hyderabad)
  POPULAR_CITIES: [
    { label: 'Mumbai', query: 'Mumbai, India' },
    { label: 'Delhi', query: 'Delhi, India' },
    { label: 'Bengaluru', query: 'Bengaluru, India' },
    { label: 'Hyderabad', query: 'Hyderabad, India' },
    { label: 'Chennai', query: 'Chennai, India' },
    { label: 'Kolkata', query: 'Kolkata, India' },
    { label: 'Pune', query: 'Pune, India' },
    { label: 'Ahmedabad', query: 'Ahmedabad, India' },
    { label: 'New York', query: 'New York' },
    { label: 'London', query: 'London' }
  ]
};
