const DEFAULTS = {
  bustimeBaseUrl: 'https://metromap.cityofmadison.com/bustime/api/v3',
  gtfsUrl: 'https://www.cityofmadison.com/metro/documents/mmt_gtfs.zip',
  apiTimeoutMs: 2500,
  apiCacheSeconds: 10,
  rtRefreshSeconds: 20
};

export type AppConfig = {
  bustimeBaseUrl: string;
  bustimeApiKey: string;
  gtfsUrl: string;
  gtfsRtTripUpdatesUrl: string;
  gtfsRtVehiclePositionsUrl: string;
  gtfsRtAlertsUrl: string;
  gtfsStaticSnapshotPath: string;
  gtfsStaticSnapshotUrl: string;
  apiTimeoutMs: number;
  apiCacheSeconds: number;
  rtRefreshSeconds: number;
};

function toInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    bustimeBaseUrl: env.MADISON_BUSTIME_BASE_URL || DEFAULTS.bustimeBaseUrl,
    bustimeApiKey: env.MADISON_BUSTIME_API_KEY || '',
    gtfsUrl: env.MADISON_GTFS_URL || DEFAULTS.gtfsUrl,
    gtfsRtTripUpdatesUrl: env.MADISON_GTFS_RT_TRIP_UPDATES_URL || '',
    gtfsRtVehiclePositionsUrl: env.MADISON_GTFS_RT_VEHICLE_POSITIONS_URL || '',
    gtfsRtAlertsUrl: env.MADISON_GTFS_RT_ALERTS_URL || '',
    gtfsStaticSnapshotPath: env.MADISON_GTFS_STATIC_SNAPSHOT_PATH || '',
    gtfsStaticSnapshotUrl: env.MADISON_GTFS_STATIC_SNAPSHOT_URL || '',
    apiTimeoutMs: toInt(env.MADISON_API_TIMEOUT_MS, DEFAULTS.apiTimeoutMs),
    apiCacheSeconds: toInt(env.MADISON_API_CACHE_SECONDS, DEFAULTS.apiCacheSeconds),
    rtRefreshSeconds: toInt(env.MADISON_RT_REFRESH_SECONDS, DEFAULTS.rtRefreshSeconds)
  };
}
