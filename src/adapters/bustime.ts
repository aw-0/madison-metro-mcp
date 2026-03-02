import { redactUrl, sanitizeErrorMessage } from '../lib/safe-log.js';

type FetchLike = typeof fetch;
type LoggerLike = Pick<typeof console, 'warn'>;
type JsonRecord = Record<string, unknown>;

export class BusTimeApiError extends Error {
  reason: string;
  statusCode?: number;

  constructor(reason: string, message: string, statusCode: number | undefined = undefined) {
    super(message);
    this.name = 'BusTimeApiError';
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

export class BusTimeApiAdapter {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  logger: LoggerLike;

  constructor({
    baseUrl,
    timeoutMs = 2500,
    fetchImpl = fetch,
    logger = console
  }: {
    baseUrl: string;
    timeoutMs?: number;
    fetchImpl?: FetchLike;
    logger?: LoggerLike;
  }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async getPredictions({ key, stopId, routeId, top = 5 }: { key: string; stopId: string; routeId?: string; top?: number }): Promise<JsonRecord[]> {
    const query = { stpid: stopId, rt: routeId, top };
    const response = await this.#request('getpredictions', key, query);
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['prd', 'predictions']);
  }

  async getVehicles({ key, routeId }: { key: string; routeId?: string }): Promise<JsonRecord[]> {
    const response = await this.#request('getvehicles', key, { rt: routeId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['vehicle', 'vehicles']);
  }

  async getServiceBulletins({ key, routeId, stopId }: { key: string; routeId?: string; stopId?: string }): Promise<JsonRecord[]> {
    const response = await this.#request('getservicebulletins', key, { rt: routeId, stpid: stopId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['sb', 'servicebulletins']);
  }

  async getDetours({ key, routeId }: { key: string; routeId?: string }): Promise<JsonRecord[]> {
    const response = await this.#request('getdetours', key, { rt: routeId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['dtr', 'detours']);
  }

  async getRoutes({ key }: { key: string }): Promise<JsonRecord[]> {
    const response = await this.#request('getroutes', key, {});
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['route', 'routes']);
  }

  async getDirections({ key, routeId }: { key: string; routeId: string }): Promise<JsonRecord[]> {
    const response = await this.#request('getdirections', key, { rt: routeId });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['direction', 'directions']);
  }

  async getStops({ key, routeId, direction }: { key: string; routeId: string; direction: string }): Promise<JsonRecord[]> {
    const response = await this.#request('getstops', key, { rt: routeId, dir: direction });
    const root = this.#root(response, { allowNoData: true });
    return this.#pickArray(root, ['stop', 'stops']);
  }

  #pickArray(root: JsonRecord, candidateKeys: string[]): JsonRecord[] {
    for (const key of candidateKeys) {
      if (!Object.prototype.hasOwnProperty.call(root, key)) {
        continue;
      }
      const value = root[key];
      if (Array.isArray(value)) {
        return value;
      }
      if (value !== undefined && value !== null) {
        return [value as JsonRecord];
      }
    }
    return [];
  }

  #root(responseJson: JsonRecord, options: { allowNoData?: boolean } = {}): JsonRecord {
    const allowNoData = Boolean(options.allowNoData);
    const root = (responseJson?.['bustime-response'] as JsonRecord | undefined) || responseJson;
    const errors = root?.error as unknown;

    if (errors) {
      const first = (Array.isArray(errors) ? errors[0] : errors) as { msg?: string; message?: string } | undefined;
      const msg = first?.msg || first?.message || 'BusTime error';
      if (allowNoData && /No data found for parameter/i.test(msg)) {
        return {} as JsonRecord;
      }
      throw new BusTimeApiError('api_error', msg);
    }

    return root || ({} as JsonRecord);
  }

  async #request(endpoint: string, key: string, queryObj: Record<string, unknown>): Promise<JsonRecord> {
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

      return (await response.json()) as JsonRecord;
    } catch (err: unknown) {
      if (err instanceof BusTimeApiError) {
        throw err;
      }
      if ((err as { name?: string } | null | undefined)?.name === 'AbortError') {
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
