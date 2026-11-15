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
      '&aqi=no';

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
    WeatherApiError: WeatherApiError
  };
})();
