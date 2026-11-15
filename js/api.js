/**
 * SKY CRED — api.js
 * WeatherAPI.com integration (FR-10) and error translation (FR-08).
 */
(function () {
  'use strict';

  const config = window.SKY_CRED_CONFIG;

  /**
   * Custom error carrying a UI-ready message and a retry flag.
   * kind: 'validation' | 'not-found' | 'config' | 'rate-limit' |
   *       'network' | 'unavailable' | 'unexpected'
   */
  class WeatherApiError extends Error {
    constructor(kind, message, canRetry) {
      super(message);
      this.name = 'WeatherApiError';
      this.kind = kind;
      this.canRetry = canRetry;
    }
  }

  /**
   * Fetch current weather for a city.
   * @param {string} city - City query (q parameter)
   * @param {AbortSignal} [signal] - Optional abort signal
   * @returns {Promise<{status:string, data:Object, rawText:string}>}
   * @throws {WeatherApiError}
   */
  async function fetchCurrentWeather(city, signal) {
    const url =
      config.WEATHER_API_BASE_URL +
      '?key=' + encodeURIComponent(config.WEATHER_API_KEY) +
      '&q=' + encodeURIComponent(city) +
      '&aqi=yes';

    let response;
    try {
      response = await fetch(url, { signal, cache: 'no-store' });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      // fetch() only rejects on network-level failures
      throw new WeatherApiError(
        'network',
        'Network connectivity issue. Please check your internet connection and try again.',
        true
      );
    }

    let rawText = '';
    try {
      rawText = await response.text();
    } catch (err) {
      throw new WeatherApiError('unexpected', 'Received an unreadable response from the weather service.', true);
    }

    // Parse JSON
    let body = null;
    try {
      body = JSON.parse(rawText);
    } catch (err) {
      // Unparseable response
      if (response.ok) {
        throw new WeatherApiError('unexpected', 'Received an unexpected response from the weather service.', true);
      }
      throw new WeatherApiError('unavailable', 'Weather service is temporarily unavailable. Please try again shortly.', true);
    }

    // API-level error payloads: { error: { code, message } }
    if (!response.ok || (body && body.error)) {
      throw translateHttpError(response.status, body && body.error);
    }

    // Validate the expected response shape before trusting it (FR-08)
    if (!body || !body.current || !body.location) {
      throw new WeatherApiError('unexpected', 'Received an unexpected response from the weather service.', true);
    }

    return { status: response.status, data: body, rawText: rawText };
  }

  /**
   * Fetch historical weather for a city on a specific date (YYYY-MM-DD).
   * Used by the "Change vs Yesterday" comparison (same lat/lon as the
   * current-weather response so the resolved location cannot drift).
   * @returns {Promise<{status:string, data:Object, rawText:string}>}
   * @throws {WeatherApiError}
   */
  async function fetchHistory(city, date, signal) {
    const url =
      config.WEATHER_HISTORY_BASE_URL +
      '?key=' + encodeURIComponent(config.WEATHER_API_KEY) +
      '&q=' + encodeURIComponent(city) +
      '&dt=' + encodeURIComponent(date);

    let response;
    try {
      response = await fetch(url, { signal, cache: 'no-store' });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new WeatherApiError('network', 'Network connectivity issue.', true);
    }

    let rawText = '';
    try {
      rawText = await response.text();
    } catch (err) {
      throw new WeatherApiError('unexpected', 'Received an unreadable response from the weather service.', true);
    }

    let body = null;
    try {
      body = JSON.parse(rawText);
    } catch (err) {
      throw new WeatherApiError('unexpected', 'Received an unexpected response from the weather service.', true);
    }

    if (!response.ok || (body && body.error)) {
      throw translateHttpError(response.status, body && body.error);
    }

    const days = body && body.forecast && body.forecast.forecastday;
    if (!days || !days.length || !days[0].hour || !days[0].hour.length) {
      throw new WeatherApiError('unexpected', 'No historical data available for this date.', false);
    }

    return { status: response.status, data: body, rawText: rawText };
  }

  /**
   * Find a representative photo of a city on Wikimedia Commons.
   * Non-critical enhancement: NEVER throws — resolves to null on any
   * failure so the app keeps its plain sky gradient (FR-08).
   * @returns {Promise<string|null>} Image URL or null
   */
  async function fetchCityImage(city) {
    const queries = [city + ' skyline', city + ' cityscape', city];
    for (const query of queries) {
      try {
        const url =
          config.WIKIMEDIA_API_URL +
          '?action=query&generator=search&gsrnamespace=6&gsrlimit=12' +
          '&gsrsearch=' + encodeURIComponent(query) +
          '&prop=imageinfo&iiprop=url%7Cmime%7Csize&iiurlwidth=1600' +
          '&format=json&origin=*';
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) continue;
        const body = await resp.json();
        const pages = body && body.query && body.query.pages
          ? Object.values(body.query.pages) : [];
        const usable = pages
          .map(function (p) { return p && p.imageinfo && p.imageinfo[0]; })
          .filter(function (info) {
            return info && info.thumburl &&
              (info.mime === 'image/jpeg' || info.mime === 'image/png') &&
              info.width >= 800 && info.width >= info.height; // landscape only
          })
          .sort(function (a, b) { return b.width - a.width; });
        if (usable.length) return usable[0].thumburl;
      } catch (err) {
        /* try next query / give up silently */
      }
    }
    return null;
  }

  function translateHttpError(status, apiError) {
    const code = apiError ? apiError.code : null;
    const apiMessage = apiError ? apiError.message : '';

    // 1006 — No matching location found
    if (code === 1006 || (status === 400 && code !== 2006 && code !== 2007 && code !== 2008)) {
      if (code === 1006) {
        return new WeatherApiError('not-found', 'City not found. Please check the spelling and try again.', false);
      }
      return new WeatherApiError('unexpected', 'Received an unexpected response from the weather service.', true);
    }
    // 2006 — API key invalid / 2008 — key disabled → configuration problem
    if (code === 2006 || code === 2008 || status === 403) {
      return new WeatherApiError(
        'config',
        'Weather API configuration error. The API key is invalid or disabled.',
        false
      );
    }
    // 2007 — plan quota exceeded → rate limit
    if (code === 2007 || status === 429) {
      return new WeatherApiError(
        'rate-limit',
        'Temporary service error. The weather API rate limit has been reached. Please try again in a little while.',
        true
      );
    }
    if (status === 503 || status === 502 || status === 504) {
      return new WeatherApiError('unavailable', 'Weather service is temporarily unavailable. Please try again shortly.', true);
    }
    return new WeatherApiError('unexpected', 'Something went wrong while fetching the weather. Please try again.', true);
  }

  window.SKY_CRED_API = {
    fetchCurrentWeather: fetchCurrentWeather,
    fetchHistory: fetchHistory,
    fetchCityImage: fetchCityImage,
    WeatherApiError: WeatherApiError
  };
})();
