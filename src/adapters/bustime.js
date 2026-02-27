import { redactUrl, sanitizeErrorMessage } from '../lib/safe-log.js';

export class BusTimeApiError extends Error {
  constructor(reason, message, statusCode = undefined) {
    super(message);
    this.name = 'BusTimeApiError';
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

export class BusTimeApiAdapter {
  constructor({ baseUrl, timeoutMs = 2500, fetchImpl = fetch, logger = console }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async getPredictions({ key, stopId, routeId, top = 5 }) {
    const query = { stpid: stopId, rt: routeId, top };
    const response = await this.#request('getpredictions', key, query);
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['prd', 'predictions']);
  }

  async getVehicles({ key, routeId }) {
    const response = await this.#request('getvehicles', key, { rt: routeId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['vehicle', 'vehicles']);
  }

  async getServiceBulletins({ key, routeId, stopId }) {
    const response = await this.#request('getservicebulletins', key, { rt: routeId, stpid: stopId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['sb', 'servicebulletins']);
  }

  async getDetours({ key, routeId }) {
    const response = await this.#request('getdetours', key, { rt: routeId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['dtr', 'detours']);
  }

  async getRoutes({ key }) {
    const response = await this.#request('getroutes', key, {});
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['route', 'routes']);
  }

  async getDirections({ key, routeId }) {
    const response = await this.#request('getdirections', key, { rt: routeId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['direction', 'directions']);
  }

  async getStops({ key, routeId, direction }) {
    const response = await this.#request('getstops', key, { rt: routeId, dir: direction });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['stop', 'stops']);
  }

  #pickArray(root, candidateKeys) {
    for (const key of candidateKeys) {
      if (!Object.prototype.hasOwnProperty.call(root, key)) {
        continue;
      }
      const value = root[key];
      if (Array.isArray(value)) {
        return value;
      }
      if (value !== undefined && value !== null) {
        return [value];
      }
    }
    return [];
  }

  #root(responseJson, options = {}) {
    const allowNoData = Boolean(options.allowNoData);
    const root = responseJson?.['bustime-response'] || responseJson;
    const errors = root?.error;

    if (errors) {
      const first = Array.isArray(errors) ? errors[0] : errors;
      const msg = first?.msg || first?.message || 'BusTime error';
      if (allowNoData && /No data found for parameter/i.test(msg)) {
        return {};
      }
      throw new BusTimeApiError('api_error', msg);
    }

    return root || {};
  }

  async #request(endpoint, key, queryObj) {
    if (!key) {
      throw new BusTimeApiError('missing_auth', 'BusTime API key is required');
    }

    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set('key', key);
    url.searchParams.set('format', 'json');

    for (const [name, value] of Object.entries(queryObj || {})) {
      if (value !== undefined && value !== null && String(value).length > 0) {
        url.searchParams.set(name, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });

      if (response.status === 429) {
        throw new BusTimeApiError('rate_limited', 'BusTime API rate limited', 429);
      }

      if (!response.ok) {
        throw new BusTimeApiError('api_error', `BusTime HTTP ${response.status}`, response.status);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof BusTimeApiError) {
        throw err;
      }
      if (err?.name === 'AbortError') {
        throw new BusTimeApiError('api_timeout', 'BusTime API request timed out');
      }

      this.logger.warn('BusTime request failed', {
        url: redactUrl(url.toString()),
        error: sanitizeErrorMessage(err)
      });
      throw new BusTimeApiError('api_error', 'BusTime API request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
