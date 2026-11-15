/**
 * SKY CRED — personality.js
 * FR-05: Translate weather conditions into simple recommendations.
 *
 * Thresholds (documented, application logic):
 *   - Wind:    wind_kph >= 30                      → strong wind
 *   - Cold:    temp_c <= 5                         → very cold
 *   - Hot:     temp_c >= 38                        → very hot
 *   - Warm:    temp_c >= 32                        → hot-ish
 *   - Pleasant: 18 <= temp_c <= 28 and calm skies  → perfect day
 *
 * Priority order for overlapping conditions (first match wins):
 *   1. Rain / thunder / snow / drizzle (by condition code)
 *   2. Strong wind
 *   3. Very cold
 *   4. Very hot
 *   5. Warm
 *   6. Pleasant
 *   7. Default (mild / neutral)
 */
(function () {
  'use strict';

  const PERSONALITIES = {
    rain: {
      title: 'Rain Check',
      description: 'Carry an umbrella before stepping out.'
    },
    wind: {
      title: 'Breezy Mode',
      description: 'Expect strong winds. Dress accordingly.'
    },
    freeze: {
      title: 'Freeze Frame',
      description: 'Bone-chilling cold. Bundle up tight.'
    },
    sun: {
      title: 'Sun Alert',
      description: 'Stay hydrated and avoid excessive sun exposure.'
    },
    warm: {
      title: 'Warm Wave',
      description: 'On the hotter side. Light clothes and water will help.'
    },
    perfect: {
      title: 'Perfect Day',
      description: 'Great weather to step outside.'
    },
    neutral: {
      title: 'Sky Neutral',
      description: 'Mild conditions. A fine day to be outdoors.'
    }
  };

  const WINDY_KPH = 30;
  const FREEZING_C = 5;
  const HOT_C = 38;
  const WARM_C = 32;
  const PLEASANT_MIN_C = 18;
  const PLEASANT_MAX_C = 28;

  /** Ranges of WeatherAPI condition codes that imply precipitation / storms. */
  const RAINY_CODE_RANGES = [
    [1063, 1063], [1087, 1087], // patchy rain / thunder
    [1150, 1201],               // drizzle and rain
    [1204, 1231],               // sleet and snow
    [1240, 1264],               // showers (rain, sleet, snow)
    [1273, 1282]                // thunderstorm with/without hail
  ];

  function isPrecipitation(code) {
    return RAINY_CODE_RANGES.some(function (range) {
      return code >= range[0] && code <= range[1];
    });
  }

  function clampScore(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Derives the weather "credit score" (0–100) and personality.
   * Higher score = more inviting conditions. Deterministic, not random.
   *
   * @param {Object} current - WeatherAPI `current` object
   * @param {number} current.temp_c
   * @param {number} current.wind_kph
   * @param {number} current.humidity
   * @param {number} current.uv
   * @param {number} current.cloud
   * @returns {{score:number, key:string, title:string, description:string}}
   */
  function getWeatherPersonality(current) {
    const tempC = typeof current.temp_c === 'number' ? current.temp_c : 0;
    const windKph = typeof current.wind_kph === 'number' ? current.wind_kph : 0;
    const humidity = typeof current.humidity === 'number' ? current.humidity : 50;
    const uv = typeof current.uv === 'number' ? current.uv : 0;
    const cloud = typeof current.cloud === 'number' ? current.cloud : 0;
    const code = current.condition && typeof current.condition.code === 'number' ? current.condition.code : 1000;

    // ---- Priority 1: precipitation / storms --------------------------------
    if (isPrecipitation(code)) {
      return build(PERSONALITIES.rain, 35 - (tempC <= FREEZING_C ? 10 : 0), tempC, windKph, humidity, uv, cloud, code);
    }

    // ---- Priority 2: strong wind -------------------------------------------
    if (windKph >= WINDY_KPH) {
      return build(PERSONALITIES.wind, 45 - Math.min(10, (windKph - WINDY_KPH) / 3), tempC, windKph, humidity, uv, cloud, code);
    }

    // ---- Priority 3: very cold ---------------------------------------------
    if (tempC <= FREEZING_C) {
      return build(PERSONALITIES.freeze, 30 + clampScore((tempC - (-10)) * 1.5, 0, 15), tempC, windKph, humidity, uv, cloud, code);
    }

    // ---- Priority 4: very hot ----------------------------------------------
    if (tempC >= HOT_C) {
      return build(PERSONALITIES.sun, 30 - Math.min(10, (tempC - HOT_C) / 2) + (uv >= 8 ? -5 : 0), tempC, windKph, humidity, uv, cloud, code);
    }

    // ---- Priority 5: warm ---------------------------------------------------
    if (tempC >= WARM_C) {
      return build(PERSONALITIES.warm, 62 - (tempC - WARM_C), tempC, windKph, humidity, uv, cloud, code);
    }

    // ---- Priority 6: pleasant ----------------------------------------------
    if (tempC >= PLEASANT_MIN_C && tempC <= PLEASANT_MAX_C) {
      const penalty = (humidity >= 80 ? 8 : 0) + (uv >= 8 ? 5 : 0) + (cloud >= 85 ? 4 : 0);
      return build(PERSONALITIES.perfect, 88 - penalty, tempC, windKph, humidity, uv, cloud, code);
    }

    // ---- Priority 7: default ------------------------------------------------
    return build(PERSONALITIES.neutral, 65, tempC, windKph, humidity, uv, cloud, code);
  }

  /** Builds the result, nudging the score with small, defined modifiers. */
  function build(personality, baseScore, tempC, windKph, humidity, uv, cloud, code) {
    let score = baseScore;
    // Small defined modifiers (not condition-type dependent)
    if (windKph >= 45) score -= 5;                       // near-gale winds
    if (uv >= 10) score -= 5;                            // extreme UV
    if (humidity >= 90) score -= 4;                      // muggy
    if (code === 1000 && cloud <= 20 && windKph <= 12) score += 5; // clear & calm
    if (tempC >= 20 && tempC <= 26 && windKph <= 15) score += 4;  // sweet spot temp

    return {
      score: Math.round(clampScore(score, 0, 100)),
      key: Object.keys(PERSONALITIES).find(function (k) { return PERSONALITIES[k] === personality; }),
      title: personality.title,
      description: personality.description
    };
  }

  window.SKY_CRED_PERSONALITY = {
    getWeatherPersonality: getWeatherPersonality,
    THRESHOLDS: {
      WINDY_KPH: WINDY_KPH,
      FREEZING_C: FREEZING_C,
      HOT_C: HOT_C,
      WARM_C: WARM_C,
      PLEASANT_MIN_C: PLEASANT_MIN_C,
      PLEASANT_MAX_C: PLEASANT_MAX_C
    }
  };
})();
