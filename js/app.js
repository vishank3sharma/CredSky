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
    metricAqi: document.getElementById('metric-aqi'),
    aqiNote: document.getElementById('aqi-note'),
    secCloud: document.getElementById('sec-cloud'),
    secVisibility: document.getElementById('sec-visibility'),
    secPressure: document.getElementById('sec-pressure'),
    secWind: document.getElementById('sec-wind'),
    secTempF: document.getElementById('sec-tempf'),
    secPm25: document.getElementById('sec-pm25'),
    // comparison
    compareCard: document.getElementById('compare-card'),
    cmpDate: document.getElementById('cmp-date'),
    cmpTemp: document.getElementById('cmp-temp'),
    cmpTempNote: document.getElementById('cmp-temp-note'),
    cmpHumidity: document.getElementById('cmp-humidity'),
    cmpHumidityNote: document.getElementById('cmp-humidity-note'),
    cmpWind: document.getElementById('cmp-wind'),
    cmpWindNote: document.getElementById('cmp-wind-note'),
    cmpCondition: document.getElementById('cmp-condition'),
    cmpConditionNote: document.getElementById('cmp-condition-note'),
    cmpFootnote: document.getElementById('cmp-footnote'),
    // favourites
    favBtn: document.getElementById('fav-btn'),
    favList: document.getElementById('favourites-list'),
    favEmpty: document.getElementById('favourites-empty'),
    bgImage: document.getElementById('bg-image'),
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
    jsonMode: 'formatted', // 'formatted' | 'raw'
    bgCity: null           // city whose photo is currently in the backdrop
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

  /** US EPA AQI index (1–6) → plain-language note. */
  function aqiLabel(usEpaIndex) {
    if (!Number.isInteger(usEpaIndex) || usEpaIndex < 1 || usEpaIndex > 6) return '—';
    return [
      '',                                   // index 0 unused
      'Good — air quality is satisfactory',
      'Moderate — acceptable for most people',
      'Unhealthy for sensitive groups',
      'Unhealthy — limit outdoor exertion',
      'Very unhealthy — avoid outdoor activity',
      'Hazardous — stay indoors if possible'
    ][usEpaIndex];
  }

  // ---------- "Change vs Yesterday" helpers ----------
  /**
   * Yesterday's date (YYYY-MM-DD) in the CITY's local calendar, derived
   * from location.localtime ("YYYY-MM-DD HH:mm"). Manual math avoids
   * timezone shifts from Date → ISO conversion.
   */
  function cityYesterdayDate(localtime) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(localtime || '');
    if (!m) return null;
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1);
    return dt.getFullYear() + '-' +
      String(dt.getMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getDate()).padStart(2, '0');
  }

  function cityLocalHour(localtime) {
    const m = /^\d{4}-\d{2}-\d{2} (\d{2}):/.exec(localtime || '');
    return m ? Number(m[1]) : null;
  }

  function signed(value, decimals, unit) {
    const s = (value > 0 ? '+' : '') + value.toFixed(decimals);
    return unit ? s + unit : s;
  }

  function setDelta(node, noteNode, delta, unit, decimals, upWord, downWord, sameWord, sameThreshold) {
    node.classList.remove('is-up', 'is-down', 'is-same');
    let arrow, cls, word;
    if (delta > sameThreshold)      { arrow = '▲ '; cls = 'is-up';   word = upWord; }
    else if (delta < -sameThreshold){ arrow = '▼ '; cls = 'is-down'; word = downWord; }
    else                            { arrow = '≈ '; cls = 'is-same'; word = sameWord; }
    node.classList.add(cls);
    node.textContent = arrow + signed(delta, decimals, unit);
    noteNode.textContent = word;
  }

  function showCompare(visible) {
    el.compareCard.hidden = !visible;
  }

  function resetCompare() {
    el.cmpTemp.textContent = '…';   el.cmpTempNote.textContent = '';
    el.cmpHumidity.textContent = '…'; el.cmpHumidityNote.textContent = '';
    el.cmpWind.textContent = '…';   el.cmpWindNote.textContent = '';
    el.cmpCondition.textContent = '…'; el.cmpConditionNote.textContent = '';
    el.cmpFootnote.textContent = '';
  }

  /**
   * Fetch yesterday's weather for the same location and render deltas.
   * Non-critical: any failure hides the card without affecting the
   * main weather display (FR-08 — valid data is never replaced).
   */
  async function loadComparison(data, requestId) {
    const localtime = data.location && data.location.localtime;
    const yesterdayDate = cityYesterdayDate(localtime);
    if (!yesterdayDate || requestId !== state.requestId) return;

    resetCompare();
    showCompare(true);
    el.cmpDate.textContent = 'compared with ' + yesterdayDate;

    // Use exact coordinates so the history query resolves the same city
    const q = data.location.lat + ',' + data.location.lon;

    try {
      const hist = await api.fetchHistory(q, yesterdayDate);
      if (requestId !== state.requestId) return; // stale — ignore

      const yesterday = hist.data.forecast.forecastday[0];
      const hour = cityLocalHour(localtime);
      const sameHour = yesterday.hour.find(function (h) {
        return h.time && h.time.endsWith(' ' + String(hour).padStart(2, '0') + ':00');
      }) || null;

      const current = data.current;
      const base = sameHour || { temp_c: yesterday.day.avgtemp_c, humidity: yesterday.day.avghumidity, wind_kph: null, condition: null };
      const usedDayAvg = !sameHour;

      setDelta(el.cmpTemp, el.cmpTempNote,
        current.temp_c - base.temp_c, '°C', 1,
        'Warmer', 'Cooler', 'About the same', 0.5);

      if (typeof base.humidity === 'number' && typeof current.humidity === 'number') {
        setDelta(el.cmpHumidity, el.cmpHumidityNote,
          current.humidity - base.humidity, '%', 0,
          'More humid', 'Drier', 'Similar humidity', 2);
      } else {
        el.cmpHumidity.textContent = '—'; el.cmpHumidityNote.textContent = 'Not available';
      }

      if (typeof base.wind_kph === 'number' && typeof current.wind_kph === 'number') {
        setDelta(el.cmpWind, el.cmpWindNote,
          current.wind_kph - base.wind_kph, ' km/h', 1,
          'Stronger', 'Calmer', 'Similar wind', 2);
      } else {
        el.cmpWind.textContent = '—'; el.cmpWindNote.textContent = 'Not available';
      }

      const todayCond = current.condition ? current.condition.text : null;
      const yestCond = base.condition ? base.condition.text : null;
      if (todayCond && yestCond) {
        el.cmpCondition.textContent = todayCond === yestCond ? 'Same' : yestCond + ' → ' + todayCond;
        el.cmpConditionNote.textContent = todayCond === yestCond ? 'No change in skies' : 'Skies have changed';
      } else {
        el.cmpCondition.textContent = '—'; el.cmpConditionNote.textContent = 'Not available';
      }

      el.cmpFootnote.textContent = usedDayAvg
        ? 'Hourly data unavailable for this hour — temperature compared with yesterday’s daily average.'
        : 'Compared with yesterday at the same local hour (' + String(hour).padStart(2, '0') + ':00).';
    } catch (err) {
      // Comparison is optional — degrade silently, keep main weather intact
      if (requestId !== state.requestId) return;
      showCompare(false);
    }
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

    // AQI (US EPA index) — only populated when the API returns air_quality data
    const air = current.air_quality;
    const usEpa = air && Number.isInteger(air['us-epa-index']) ? air['us-epa-index'] : null;
    el.metricAqi.textContent = usEpa !== null ? String(usEpa) : '—';
    el.aqiNote.textContent = aqiLabel(usEpa !== null ? usEpa : Number.NaN);

    // Secondary info (FR-06)
    el.secCloud.textContent = fmt(current.cloud, '%');
    el.secVisibility.textContent = fmtNumber(current.vis_km, 1, 'km');
    el.secPressure.textContent = fmtNumber(current.pressure_mb, 0, 'mb');
    el.secWind.textContent = typeof current.wind_kph === 'number' ? Math.round(current.wind_kph) + ' km/h' : '—';
    el.secTempF.textContent = typeof current.temp_f === 'number' ? Math.round(current.temp_f) + ' °F' : '—';
    el.secPm25.textContent = air && typeof air.pm2_5 === 'number' ? air.pm2_5.toFixed(1) + ' µg/m³' : '—';
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

  // ---------- Favourites (localStorage-backed) ----------
  const FAV_KEY = 'skyc:favourites';
  let memoryFavourites = null; // fallback when localStorage is unavailable

  function getFavourites() {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(function (x) { return typeof x === 'string' && x.trim(); }) : [];
    } catch (err) {
      return Array.isArray(memoryFavourites) ? memoryFavourites : [];
    }
  }

  function saveFavourites(list) {
    memoryFavourites = list;
    try { window.localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (err) { /* private mode etc. */ }
  }

  function isFavourite(city) {
    const target = (city || '').trim().toLowerCase();
    return getFavourites().some(function (c) { return c.toLowerCase() === target; });
  }

  function updateFavButton() {
    const city = el.city.textContent;
    const fav = isFavourite(city) && city && city !== '—';
    el.favBtn.textContent = fav ? '★' : '☆';
    el.favBtn.classList.toggle('is-fav', fav);
    el.favBtn.setAttribute('aria-pressed', String(fav));
    el.favBtn.setAttribute('aria-label',
      (fav ? 'Remove ' : 'Add ') + (city || 'city') + (fav ? ' from favourites' : ' to favourites'));
  }

  function toggleFavourite() {
    const city = el.city.textContent.trim();
    if (!city || city === '—') return;
    const list = getFavourites();
    const target = city.toLowerCase();
    const index = list.findIndex(function (c) { return c.toLowerCase() === target; });
    if (index >= 0) {
      list.splice(index, 1);          // remove
    } else {
      list.unshift(city);             // add newest first
    }
    saveFavourites(list);
    updateFavButton();
    renderFavourites();
  }

  function removeFavourite(city) {
    const target = (city || '').toLowerCase();
    saveFavourites(getFavourites().filter(function (c) { return c.toLowerCase() !== target; }));
    updateFavButton();
    renderFavourites();
  }

  function renderFavourites() {
    const list = getFavourites();
    el.favList.textContent = '';
    el.favEmpty.hidden = list.length > 0;

    list.forEach(function (city) {
      const li = document.createElement('li');
      li.className = 'fav-chip';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'chip chip-fav-load';
      loadBtn.textContent = city;
      loadBtn.setAttribute('aria-label', 'Show weather for favourite city ' + city);
      loadBtn.addEventListener('click', function () {
        el.input.value = city;
        loadWeather(city);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'fav-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', 'Remove ' + city + ' from favourites');
      removeBtn.addEventListener('click', function () { removeFavourite(city); });

      li.appendChild(loadBtn);
      li.appendChild(removeBtn);
      el.favList.appendChild(li);
    });
  }

  // ---------- City photo backdrop (non-critical) ----------
  /**
   * Loads a photo of the displayed city behind a light veil.
   * Never affects weather data; on failure the sky gradient stays.
   */
  async function applyCityBackground(location, requestId) {
    const name = location && location.name;
    if (!name || state.bgCity === name) return;

    const url = await api.fetchCityImage(name);
    if (requestId !== state.requestId) return; // stale — city changed meanwhile
    if (!url) return;                          // keep gradient, try again next city

    state.bgCity = name;
    el.bgImage.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    el.bgImage.classList.add('is-visible');
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
      updateFavButton();                         // favourites star reflects loaded city
      loadComparison(payload.data, requestId);   // vs-yesterday deltas (non-blocking)
      applyCityBackground(payload.data.location, requestId); // city photo (non-blocking)
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

  // Favourites events
  el.favBtn.addEventListener('click', toggleFavourite);

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
    renderFavourites();
    el.input.value = config.DEFAULT_CITY;
    showStates('none');
    loadWeather(config.DEFAULT_CITY);
  }

  init();
})();
