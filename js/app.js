/**
 * SKY CRED — app.js
 * Application controller: state management, DOM updates, events.
 *
 * States: idle → loading → success | error
 * Guard: every request is tagged with an id; stale responses are ignored (FR-08).
 */
(function () {
  'use strict';

  const config = window.SKY_CRED_CONFIG;
  const api = window.SKY_CRED_API;
  const personality = window.SKY_CRED_PERSONALITY;

  // ---------- DOM references ----------
  const el = {
    form: document.getElementById('search-form'),
    input: document.getElementById('city-input'),
    searchBtn: document.getElementById('search-btn'),
    searchHint: document.getElementById('search-hint'),
    chipsList: document.getElementById('popular-cities-list'),
    loading: document.getElementById('loading-state'),
    error: document.getElementById('error-state'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    weather: document.getElementById('weather-content'),
    // weather card
    city: document.getElementById('weather-city'),
    region: document.getElementById('weather-region'),
    localtime: document.getElementById('weather-localtime'),
    icon: document.getElementById('weather-icon'),
    condition: document.getElementById('weather-condition'),
    temp: document.getElementById('weather-temp'),
    feels: document.getElementById('weather-feels'),
    credScore: document.getElementById('cred-score'),
    credTitle: document.getElementById('cred-title'),
    credDescription: document.getElementById('cred-description'),
    // metrics
    metricHumidity: document.getElementById('metric-humidity'),
    metricWind: document.getElementById('metric-wind'),
    metricUv: document.getElementById('metric-uv'),
    uvNote: document.getElementById('uv-note'),
    secCloud: document.getElementById('sec-cloud'),
    secVisibility: document.getElementById('sec-visibility'),
    secPressure: document.getElementById('sec-pressure'),
    secWind: document.getElementById('sec-wind'),
    secTempF: document.getElementById('sec-tempf'),
    secUpdated: document.getElementById('sec-updated'),
    // json viewer
    tabFormatted: document.getElementById('tab-formatted'),
    tabRaw: document.getElementById('tab-raw'),
    jsonOutput: document.getElementById('json-output'),
    copyBtn: document.getElementById('copy-json')
  };

  // ---------- State ----------
  const state = {
    currentCity: null,
    requestId: 0,          // guard against stale responses (FR-08)
    lastPayload: null,     // { data, rawText }
    jsonMode: 'formatted'  // 'formatted' | 'raw'
  };

  const ERROR_TITLES = {
    validation: 'Please enter a city',
    'not-found': 'City not found',
    config: 'Weather API configuration error',
    'rate-limit': 'Temporary service error',
    network: 'Network connectivity issue',
    unavailable: 'Weather service unavailable',
    unexpected: 'Something went wrong'
  };

  // ---------- Helpers ----------
  function isHidden(node) { return node.hidden; }

  function showStates(which) {
    // which: 'loading' | 'error' | 'weather' | 'none'
    el.loading.hidden = which !== 'loading';
    el.error.hidden = which !== 'error';
    el.weather.hidden = which !== 'weather';
  }

  function setHint(message) {
    el.searchHint.textContent = message || '';
  }

  function fmt(value, suffix) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return String(value) + (suffix ? ' ' + suffix : '');
  }

  function fmtNumber(value, decimals, suffix) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return Number(value).toFixed(decimals) + (suffix ? ' ' + suffix : '');
  }

  function uvLabel(uv) {
    if (uv === null || uv === undefined || Number.isNaN(uv)) return '—';
    if (uv < 3) return 'Low — no sun protection needed';
    if (uv < 6) return 'Moderate — seek shade around midday';
    if (uv < 8) return 'High — use sunscreen and sunglasses';
    if (uv < 11) return 'Very high — limit time in the sun';
    return 'Extreme — avoid sun exposure';
  }

  // ---------- Rendering ----------
  function renderWeather(payload) {
    const data = payload.data;
    const location = data.location;
    const current = data.current;
    const condition = current.condition || {};

    // Weather card (FR-04)
    el.city.textContent = location.name || '—';
    el.region.textContent = [location.region, location.country].filter(Boolean).join(', ') || '—';
    el.localtime.textContent = 'Local time: ' + (location.localtime || '—');
    el.icon.src = condition.icon ? (condition.icon.startsWith('//') ? 'https:' + condition.icon : condition.icon) : '';
    el.icon.alt = 'Weather: ' + (condition.text || 'current conditions');
    el.condition.textContent = condition.text || '—';
    el.temp.textContent = typeof current.temp_c === 'number' ? Math.round(current.temp_c) : '—';
    el.feels.textContent = typeof current.feelslike_c === 'number' ? 'Feels like ' + Math.round(current.feelslike_c) + '°C' : '';

    // Weather interpretation (FR-05)
    const cred = personality.getWeatherPersonality(current);
    el.credScore.textContent = String(cred.score);
    el.credTitle.textContent = cred.title;
    el.credDescription.textContent = cred.description;

    // Primary metrics (FR-06)
    el.metricHumidity.textContent = fmt(current.humidity);
    el.metricWind.textContent = typeof current.wind_kph === 'number' ? Math.round(current.wind_kph) : '—';
    el.metricUv.textContent = typeof current.uv === 'number' ? current.uv : '—';
    el.uvNote.textContent = uvLabel(current.uv);

    // Secondary info (FR-06)
    el.secCloud.textContent = fmt(current.cloud, '%');
    el.secVisibility.textContent = fmtNumber(current.vis_km, 1, 'km');
    el.secPressure.textContent = fmtNumber(current.pressure_mb, 0, 'mb');
    el.secWind.textContent = typeof current.wind_kph === 'number' ? Math.round(current.wind_kph) + ' km/h' : '—';
    el.secTempF.textContent = typeof current.temp_f === 'number' ? Math.round(current.temp_f) + ' °F' : '—';
    el.secUpdated.textContent = current.last_updated || '—';

    // JSON viewer (FR-07) — always synced with the actual response
    state.lastPayload = payload;
    renderJson();

    showStates('weather');
  }

  function renderJson() {
    if (!state.lastPayload) {
      el.jsonOutput.textContent = '// No API response yet';
      return;
    }
    if (state.jsonMode === 'formatted') {
      el.jsonOutput.textContent = JSON.stringify(state.lastPayload.data, null, 2); // FR-07.1
    } else {
      el.jsonOutput.textContent = state.lastPayload.rawText; // FR-07.2
    }
  }

  function showError(kind, message, canRetry) {
    el.errorTitle.textContent = ERROR_TITLES[kind] || 'Something went wrong';
    el.errorMessage.textContent = message;
    el.retryBtn.hidden = !canRetry;
    showStates('error');
  }

  // ---------- Data flow ----------
  async function loadWeather(city) {
    // FR-02.4 — empty input must not trigger a request
    const trimmed = (city || '').trim();
    if (!trimmed) {
      setHint('Please enter a city name to search.');
      el.input.focus();
      return;
    }

    setHint('');
    state.currentCity = trimmed;
    const requestId = ++state.requestId;

    // FR-01.3 / FR-08 — immediate loading feedback
    showStates('loading');
    el.searchBtn.disabled = true;

    try {
      const payload = await api.fetchCurrentWeather(trimmed);
      if (requestId !== state.requestId) return; // stale response — ignore (FR-08)
      el.input.value = state.currentCity;        // FR-02: retain searched city
      markActiveChip(state.currentCity);         // FR-03.4
      renderWeather(payload);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (requestId !== state.requestId) return; // stale error — ignore
      if (err instanceof api.WeatherApiError) {
        showError(err.kind, err.message, err.canRetry);
      } else {
        showError('unexpected', 'Something went wrong while fetching the weather. Please try again.', true);
      }
    } finally {
      if (requestId === state.requestId) {
        el.searchBtn.disabled = false;
      }
    }
  }

  // ---------- Popular cities (FR-03) ----------
  function buildChips() {
    config.POPULAR_CITIES.forEach(function (city) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = city;
      btn.dataset.city = city;
      btn.setAttribute('aria-label', 'Show weather for ' + city);
      btn.addEventListener('click', function () {
        el.input.value = city;   // FR-03.3 — search sync
        loadWeather(city);
      });
      li.appendChild(btn);
      el.chipsList.appendChild(li);
    });
  }

  function markActiveChip(city) {
    const normalized = (city || '').trim().toLowerCase();
    Array.prototype.forEach.call(el.chipsList.querySelectorAll('.chip'), function (chip) {
      const isActive = chip.dataset.city.toLowerCase() === normalized;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
    });
  }

  // ---------- Events ----------
  el.form.addEventListener('submit', function (event) {
    event.preventDefault(); // no page refresh — multiple searches supported (FR-02)
    loadWeather(el.input.value);
  });

  el.retryBtn.addEventListener('click', function () {
    loadWeather(state.currentCity || config.DEFAULT_CITY);
  });

  // JSON tabs (FR-07.3)
  function setJsonMode(mode) {
    state.jsonMode = mode;
    const formatted = mode === 'formatted';
    el.tabFormatted.classList.toggle('is-active', formatted);
    el.tabRaw.classList.toggle('is-active', !formatted);
    el.tabFormatted.setAttribute('aria-selected', String(formatted));
    el.tabRaw.setAttribute('aria-selected', String(!formatted));
    renderJson();
  }
  el.tabFormatted.addEventListener('click', function () { setJsonMode('formatted'); });
  el.tabRaw.addEventListener('click', function () { setJsonMode('raw'); });

  // Copy button (FR-07.4) — copies the currently selected representation
  el.copyBtn.addEventListener('click', function () {
    const text = el.jsonOutput.textContent || '';
    const fallback = function () {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) { /* noop */ }
      document.body.removeChild(ta);
      flashCopied();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flashCopied).catch(fallback);
    } else {
      fallback();
    }
  });

  function flashCopied() {
    const original = 'Copy';
    el.copyBtn.textContent = 'Copied!';
    el.copyBtn.classList.add('is-copied');
    window.setTimeout(function () {
      el.copyBtn.textContent = original;
      el.copyBtn.classList.remove('is-copied');
    }, 1600);
  }

  // ---------- Initialization (FR-01) ----------
  function init() {
    buildChips();
    el.input.value = config.DEFAULT_CITY;
    showStates('none');
    loadWeather(config.DEFAULT_CITY);
  }

  init();
})();
