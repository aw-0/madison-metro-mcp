import { loadConfig } from './config.js';
import { BusTimeApiAdapter } from './adapters/bustime.js';
import { GtfsRtAdapter } from './adapters/gtfs-rt.js';
import { GtfsStaticAdapter } from './adapters/gtfs-static.js';
import { MetroService } from './metro-service.js';
import { JsonRpcMcpServer } from './mcp-server.js';

async function main() {
  const config = loadConfig(process.env);

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

  const server = new JsonRpcMcpServer({
    metroService,
    defaultMetroApiKey: config.bustimeApiKey
  });
  server.start();
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
