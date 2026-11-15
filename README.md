# SKY CRED ☁

> Check the sky's credit score before you step out.

A lightweight weather application that fetches live weather from [WeatherAPI.com](https://www.weatherapi.com/) and translates conditions into simple, actionable recommendations.

## Features

- 🌆 **Default city (Mumbai)** loads automatically on launch
- 🔍 **Search any city** — button click or Enter key
- 🏙 **Popular city chips** — Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, New York, London
- 🌡 **Live current conditions** — temperature (°C), condition icon, city-local time, feels-like
- 🧮 **Weather personality** — application-generated score (0–100) + recommendation (Rain Check, Sun Alert, Perfect Day, …)
- 💧 **Metric cards** — humidity, wind (km/h), UV index, AQI (US EPA) + secondary metrics (cloud, visibility, pressure, °F, PM2.5, last updated)
- 🧑‍💻 **API response viewer** — formatted/raw JSON tabs with copy-to-clipboard
- 🛡 **Robust error handling** — validation, city not found, invalid key, rate limit, network & server errors, with Retry
- 📱 **Responsive** — desktop, tablet and mobile (no horizontal overflow)
- ♿ **Accessible** — labels, live regions, keyboard support

## Tech

Plain HTML + CSS + vanilla JavaScript. No frameworks, no build step, no mock data.

```
├── index.html
├── css/style.css
├── js/config.js        # API key + app configuration
├── js/api.js           # WeatherAPI integration + error translation
├── js/personality.js   # FR-05 interpretation logic (thresholds + priority)
└── js/app.js           # UI state machine + DOM rendering
```

## Run locally

Any static server works:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Configuration

The WeatherAPI key lives in `js/config.js` (`WEATHER_API_KEY`). It is a **frontend key** — per the PRD, frontend API keys are not treated as secure secrets. A `.env` file is included locally for reference and is git-ignored.

> Note: WeatherAPI's free tier uses HTTP referer-based origin rules for browser requests; requests from `localhost` and Vercel domains work out of the box.

## Deploy

Deployed on Vercel as a static site. Every push to `main` is automatically deployed.
