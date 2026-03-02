import { BusTimeApiAdapter } from './adapters/bustime.js';
import { GtfsRtAdapter } from './adapters/gtfs-rt.js';
import { GtfsStaticAdapter } from './adapters/gtfs-static.js';
import { loadConfig } from './config.js';
import { MetroService } from './metro-service.js';

export type AppContext = {
  metroService: MetroService;
  defaultMetroApiKey: string;
};

export async function createAppContext(env: NodeJS.ProcessEnv = process.env): Promise<AppContext> {
  const config = loadConfig(env);

  const busTimeAdapter = new BusTimeApiAdapter({
    baseUrl: config.bustimeBaseUrl,
    timeoutMs: config.apiTimeoutMs
  });

  const gtfsRtAdapter = new GtfsRtAdapter({
    tripUpdatesUrl: config.gtfsRtTripUpdatesUrl,
    vehiclePositionsUrl: config.gtfsRtVehiclePositionsUrl,
    alertsUrl: config.gtfsRtAlertsUrl
  });

  const gtfsStaticAdapter = new GtfsStaticAdapter({
    snapshotPath: config.gtfsStaticSnapshotPath,
    snapshotUrl: config.gtfsStaticSnapshotUrl
  });

  const metroService = new MetroService({
    busTimeAdapter,
    gtfsRtAdapter,
    gtfsStaticAdapter
  });

  await metroService.initialize();

  return {
    metroService,
    defaultMetroApiKey: config.bustimeApiKey
  };
}
