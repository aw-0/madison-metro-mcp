import test from 'node:test';
import assert from 'node:assert/strict';
import { MetroService } from '../src/metro-service.js';
import { BusTimeApiError } from '../src/adapters/bustime.js';

function makeService(overrides = {}) {
  const busTimeAdapter = overrides.busTimeAdapter || {
    getPredictions: async () => [],
    getVehicles: async () => [],
    getServiceBulletins: async () => [],
    getDetours: async () => [],
    getRoutes: async () => [],
    getStops: async () => [],
    getDirections: async () => []
  };

  const gtfsRtAdapter = overrides.gtfsRtAdapter || {
    getPredictionsForStop: async () => [],
    getVehiclePositions: async () => [],
    getAlerts: async () => []
  };

  const gtfsStaticAdapter = overrides.gtfsStaticAdapter || {
    loaded: true,
    refresh: async () => {},
    listRoutes: () => [],
    listStops: () => [],
    getScheduledDepartures: () => []
  };

  return new MetroService({ busTimeAdapter, gtfsRtAdapter, gtfsStaticAdapter });
}

test('nextDepartures uses API when bearer token is present and API returns predictions', async () => {
  const service = makeService({
    busTimeAdapter: {
      getPredictions: async ({ key }) => {
        assert.equal(key, 'metro-token');
        return [{ stpid: '123', rt: 'A', prdtm: '20260227 12:05', schdtm: '20260227 12:00', psgld: 'EMPTY' }];
      }
    }
  });

  const result = await service.nextDepartures({ stop_id: '123' }, { metroApiKey: 'metro-token' });
  assert.equal(result.source, 'api');
  assert.equal(result.api_tier_used, true);
  assert.equal(result.departures.length, 1);
  assert.equal(Boolean(result.departures[0].predicted_time), true);
  assert.equal(result.departures[0].capacity_level, 'empty');
  assert.equal(result.departures[0].capacity_load_raw, 'EMPTY');
  assert.equal(result.departures[0].capacity_percent, null);
});

test('nextDepartures falls back with missing auth', async () => {
  const service = makeService({
    gtfsRtAdapter: {
      getPredictionsForStop: async () => [{ stop_id: '123', predicted_time: '2026-02-27T18:05:00.000Z', source: 'gtfs_rt' }],
      getVehiclePositions: async () => [],
      getAlerts: async () => []
    }
  });

  const result = await service.nextDepartures({ stop_id: '123' }, { metroApiKey: undefined });
  assert.equal(result.fallback_reason, 'missing_auth');
  assert.equal(result.source, 'gtfs_rt');
});

test('nextDepartures falls back when API errors', async () => {
  const service = makeService({
    busTimeAdapter: {
      getPredictions: async () => {
        throw new BusTimeApiError('api_timeout', 'timed out');
      }
    },
    gtfsStaticAdapter: {
      loaded: true,
      refresh: async () => {},
      listRoutes: () => [],
      listStops: () => [],
      getScheduledDepartures: () => [{ stop_id: '123', scheduled_time: '2026-02-27T18:20:00.000Z', source: 'schedule' }]
    }
  });

  const result = await service.nextDepartures({ stop_id: '123' }, { metroApiKey: 'metro-token' });
  assert.equal(result.fallback_reason, 'api_timeout');
  assert.equal(result.source, 'schedule');
});

test('nextDepartures enriches capacity from vehicles when prediction load is missing', async () => {
  const service = makeService({
    busTimeAdapter: {
      getPredictions: async () => [
        {
          stpid: '0336',
          rt: '80',
          vid: '2212',
          prdtm: '20260227 12:05',
          schdtm: '20260227 12:00',
          psgld: ''
        }
      ],
      getVehicles: async ({ routeId }) => {
        assert.equal(routeId, '80');
        return [{ vid: '2212', rt: '80', lat: 43.07, lon: -89.4, psgld: 'FULL' }];
      }
    }
  });

  const result = await service.nextDepartures({ stop_id: '0336', route_id: '80' }, { metroApiKey: 'metro-token' });
  assert.equal(result.source, 'api');
  assert.equal(result.departures.length, 1);
  assert.equal(result.departures[0].capacity_load_raw, 'FULL');
  assert.equal(result.departures[0].capacity_level, 'full');
});

test('nextDepartures enriches capacity from vehicles by trip_id when vid is missing', async () => {
  const service = makeService({
    busTimeAdapter: {
      getPredictions: async () => [
        {
          stpid: '0336',
          rt: '80',
          vid: '',
          tatripid: '1234697',
          prdtm: '20260227 12:05',
          schdtm: '20260227 12:00',
          psgld: ''
        }
      ],
      getVehicles: async () => [{ vid: '2212', rt: '80', tatripid: '1234697', lat: 43.07, lon: -89.4, psgld: 'EMPTY' }]
    }
  });

  const result = await service.nextDepartures({ stop_id: '0336', route_id: '80' }, { metroApiKey: 'metro-token' });
  assert.equal(result.source, 'api');
  assert.equal(result.departures.length, 1);
  assert.equal(result.departures[0].capacity_load_raw, 'EMPTY');
  assert.equal(result.departures[0].capacity_level, 'empty');
});

test('vehiclePositions maps capacity fields from API load values', async () => {
  const service = makeService({
    busTimeAdapter: {
      getVehicles: async () => [
        {
          vid: '2212',
          rt: '80',
          lat: 43.07,
          lon: -89.4,
          psgld: '67%'
        }
      ]
    }
  });

  const result = await service.vehiclePositions({ route_id: '80' }, { metroApiKey: 'metro-token' });
  assert.equal(result.source, 'api');
  assert.equal(result.vehicles.length, 1);
  assert.equal(result.vehicles[0].capacity_load_raw, '67%');
  assert.equal(result.vehicles[0].capacity_percent, 67);
  assert.equal(result.vehicles[0].capacity_level, 'medium');
});
