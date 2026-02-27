import { BusTimeApiError } from './adapters/bustime.js';

function firstArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function mapBusTimePrediction(prediction) {
  const scheduled = prediction?.schdtm ? asIso(prediction.schdtm) : null;
  const predicted = prediction?.prdtm ? asIso(prediction.prdtm) : null;
  const delaySeconds = scheduled && predicted ? Math.floor((new Date(predicted).getTime() - new Date(scheduled).getTime()) / 1000) : null;
  const capacity = normalizeCapacity(prediction?.psgld);

  return {
    stop_id: prediction.stpid,
    route_id: prediction.rt,
    vehicle_id: prediction.vid,
    trip_id: prediction.tripid || prediction.tatripid,
    headsign: prediction.des,
    scheduled_time: scheduled,
    predicted_time: predicted,
    delay_seconds: delaySeconds,
    is_canceled: prediction.dyn === 'CANCELED',
    capacity_load_raw: capacity.raw,
    capacity_level: capacity.level,
    capacity_percent: capacity.percent,
    source: 'api',
    confidence: 'high'
  };
}

function mapBusTimeVehicle(vehicle) {
  const capacity = normalizeCapacity(vehicle?.psgld);

  return {
    vehicle_id: vehicle.vid,
    route_id: vehicle.rt,
    trip_id: vehicle.tripid || vehicle.tatripid,
    lat: Number(vehicle.lat),
    lon: Number(vehicle.lon),
    bearing: vehicle.hdg ? Number(vehicle.hdg) : undefined,
    speed_mph: vehicle.spd ? Number(vehicle.spd) : undefined,
    timestamp: vehicle.tmstmp ? asIso(vehicle.tmstmp) : undefined,
    capacity_load_raw: capacity.raw,
    capacity_level: capacity.level,
    capacity_percent: capacity.percent,
    source: 'api'
  };
}

function mergeDepartureCapacityFromVehicles(departures, vehiclesById, vehiclesByTripId) {
  return departures.map((departure) => {
    if (departure.capacity_load_raw) {
      return departure;
    }

    let vehicle = null;
    if (departure.vehicle_id) {
      vehicle = vehiclesById.get(String(departure.vehicle_id));
    }
    if (!vehicle && departure.trip_id) {
      vehicle = vehiclesByTripId.get(String(departure.trip_id));
    }

    if (!vehicle) {
      return departure;
    }

    return {
      ...departure,
      capacity_load_raw: vehicle.capacity_load_raw ?? departure.capacity_load_raw,
      capacity_level: vehicle.capacity_level ?? departure.capacity_level,
      capacity_percent: vehicle.capacity_percent ?? departure.capacity_percent
    };
  });
}

function mapBulletin(sb) {
  return {
    id: sb.nm || sb.id,
    title: sb.ttl || 'Service bulletin',
    description: sb.dtl || sb.shrt_dtl || '',
    source: 'api'
  };
}

function mapDetour(dtr) {
  return {
    id: dtr.id,
    title: dtr.desc || 'Detour',
    description: dtr.msg || '',
    source: 'api'
  };
}

function mapBusTimeStop(stop, routeId = undefined, directionId = undefined) {
  return {
    stop_id: stop.stpid,
    stop_name: stop.stpnm,
    stop_lat: Number(stop.lat),
    stop_lon: Number(stop.lon),
    route_id: routeId,
    direction_id: directionId
  };
}

function normalizeDirectionToken(direction) {
  if (!direction) {
    return '';
  }

  if (typeof direction === 'string') {
    return direction;
  }

  return direction.id || direction.dir || direction.name || '';
}

function normalizeCapacity(rawValue) {
  const raw = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!raw) {
    return { raw: null, level: null, percent: null };
  }

  const percent = parseCapacityPercent(raw);
  if (percent !== null) {
    return {
      raw,
      percent,
      level: capacityLevelFromPercent(percent)
    };
  }

  const normalized = raw.toUpperCase().replace(/[\s-]+/g, '_');
  const level = CAPACITY_LEVEL_BY_TOKEN[normalized] || inferCapacityLevelFromToken(normalized);
  return {
    raw,
    level: level || 'unknown',
    percent: null
  };
}

function parseCapacityPercent(raw) {
  const pctMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const value = Number.parseFloat(pctMatch[1]);
    if (Number.isFinite(value)) {
      return clamp(Math.round(value), 0, 100);
    }
  }

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number.parseFloat(raw);
    if (numeric >= 0 && numeric <= 1) {
      return clamp(Math.round(numeric * 100), 0, 100);
    }

    if (numeric >= 0 && numeric <= 100) {
      return clamp(Math.round(numeric), 0, 100);
    }
  }

  return null;
}

function capacityLevelFromPercent(percent) {
  if (percent <= 20) return 'empty';
  if (percent <= 45) return 'low';
  if (percent <= 70) return 'medium';
  if (percent <= 90) return 'high';
  return 'full';
}

function inferCapacityLevelFromToken(token) {
  if (token.includes('EMPTY')) return 'empty';
  if (token.includes('FULL') || token.includes('CRUSHED')) return 'full';
  if (token.includes('STANDING')) return 'high';
  if (token.includes('LOW') || token.includes('MANY_SEATS')) return 'low';
  if (token.includes('MED') || token.includes('FEW_SEATS')) return 'medium';
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const CAPACITY_LEVEL_BY_TOKEN = {
  EMPTY: 'empty',
  HALF_EMPTY: 'low',
  HALF_FULL: 'medium',
  MANY_SEATS_AVAILABLE: 'low',
  FEW_SEATS_AVAILABLE: 'medium',
  STANDING_ROOM_ONLY: 'high',
  CRUSHED_STANDING_ROOM_ONLY: 'full',
  FULL: 'full'
};

function asIso(localDateString) {
  if (!localDateString) {
    return null;
  }

  const raw = String(localDateString).trim();

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (compactMatch) {
    const [, y, m, d, hh, mm, ss = '00'] = compactMatch;
    const maybeDate = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
    if (!Number.isNaN(maybeDate.getTime())) {
      return maybeDate.toISOString();
    }
  }

  const dashedMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dashedMatch) {
    const [, y, m, d, hh, mm, ss = '00'] = dashedMatch;
    const maybeDate = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
    if (!Number.isNaN(maybeDate.getTime())) {
      return maybeDate.toISOString();
    }
  }

  const maybeDate = new Date(raw.replace(' ', 'T'));
  if (!Number.isNaN(maybeDate.getTime())) {
    return maybeDate.toISOString();
  }

  return null;
}

export class MetroService {
  constructor({ busTimeAdapter, gtfsRtAdapter, gtfsStaticAdapter }) {
    this.busTimeAdapter = busTimeAdapter;
    this.gtfsRtAdapter = gtfsRtAdapter;
    this.gtfsStaticAdapter = gtfsStaticAdapter;
    this.lastStatus = {
      auth_mode: 'pass_through',
      api_tier_used: false,
      static_loaded: false,
      errors: []
    };
    this.apiStopCache = {
      fetchedAtMs: 0,
      stops: []
    };
  }

  async initialize() {
    await this.gtfsStaticAdapter.refresh();
    this.lastStatus.static_loaded = this.gtfsStaticAdapter.loaded;
  }

  async routesList(args, authCtx) {
    const routes = this.gtfsStaticAdapter.listRoutes({ query: args.query });
    if (routes.length > 0) {
      return { routes, source: 'schedule', api_auth_present: Boolean(authCtx.metroApiKey) };
    }

    if (!authCtx.metroApiKey) {
      return { routes: [], source: 'schedule', api_auth_present: false, fallback_reason: 'missing_auth' };
    }

    try {
      const apiRoutes = await this.busTimeAdapter.getRoutes({ key: authCtx.metroApiKey });
      this.lastStatus.api_tier_used = true;
      return {
        routes: firstArray(apiRoutes).map((route) => ({
          route_id: route.rt,
          route_short_name: route.rt,
          route_long_name: route.rtnm,
          route_color: route.rtclr
        })),
        source: 'api',
        api_auth_present: true
      };
    } catch {
      return { routes: [], source: 'schedule', api_auth_present: true, fallback_reason: 'api_error' };
    }
  }

  async stopsList(args, authCtx) {
    const stops = this.gtfsStaticAdapter.listStops({
      routeId: args.route_id,
      nearLat: args.near_lat,
      nearLon: args.near_lon,
      radiusM: args.radius_m,
      limit: args.limit
    });

    if (stops.length > 0) {
      return { stops, source: 'schedule', api_auth_present: Boolean(authCtx.metroApiKey) };
    }

    if (!authCtx.metroApiKey) {
      return { stops: [], source: 'schedule', api_auth_present: false, fallback_reason: 'missing_auth' };
    }

    try {
      let apiStops = [];

      if (args.route_id) {
        const directions = args.direction_id
          ? [args.direction_id]
          : (await this.busTimeAdapter.getDirections({ key: authCtx.metroApiKey, routeId: args.route_id })).map(normalizeDirectionToken);

        const stopGroups = await Promise.all(
          directions
            .filter(Boolean)
            .map((direction) =>
              this.busTimeAdapter.getStops({
                key: authCtx.metroApiKey,
                routeId: args.route_id,
                direction
              })
            )
        );

        apiStops = stopGroups.flat().map((stop) => mapBusTimeStop(stop, args.route_id, args.direction_id));
      } else if (args.near_lat !== undefined && args.near_lon !== undefined) {
        const allStops = await this.#getAllApiStops(authCtx.metroApiKey);
        apiStops = this.#filterStopsByGeo(allStops, args.near_lat, args.near_lon, args.radius_m || 500);
      } else {
        return { stops: [], source: 'api', api_auth_present: true, fallback_reason: 'api_empty' };
      }

      const deduped = this.#dedupeStops(apiStops).slice(0, Number(args.limit || 50));
      this.lastStatus.api_tier_used = true;

      return { stops: deduped, source: 'api', api_auth_present: true, fallback_reason: deduped.length > 0 ? undefined : 'api_empty' };
    } catch {
      return { stops: [], source: 'schedule', api_auth_present: true, fallback_reason: 'api_error' };
    }
  }

  async nextDepartures(args, authCtx) {
    const response = {
      departures: [],
      api_auth_required: true,
      api_auth_present: Boolean(authCtx.metroApiKey),
      source: 'schedule',
      fallback_reason: undefined,
      api_tier_used: false
    };

    if (authCtx.metroApiKey) {
      try {
        const predictions = await this.busTimeAdapter.getPredictions({
          key: authCtx.metroApiKey,
          stopId: args.stop_id,
          routeId: args.route_id,
          top: args.limit || 5
        });

        if (predictions.length > 0) {
          let departures = predictions.map(mapBusTimePrediction);

          const needsCapacityEnrichment = departures.some(
            (item) => !item.capacity_load_raw && (item.vehicle_id || item.trip_id)
          );
          if (needsCapacityEnrichment) {
            const routeIds = Array.from(
              new Set(departures.map((item) => item.route_id).filter(Boolean).map((value) => String(value)))
            );

            if (routeIds.length > 0) {
              const vehicleGroups = await Promise.all(
                routeIds.map((routeId) => this.busTimeAdapter.getVehicles({ key: authCtx.metroApiKey, routeId }))
              );
              const mappedVehicles = vehicleGroups.flat().map(mapBusTimeVehicle);
              const vehiclesById = new Map(mappedVehicles.map((vehicle) => [String(vehicle.vehicle_id), vehicle]));
              const vehiclesByTripId = new Map(
                mappedVehicles
                  .filter((vehicle) => vehicle.trip_id)
                  .map((vehicle) => [String(vehicle.trip_id), vehicle])
              );
              departures = mergeDepartureCapacityFromVehicles(departures, vehiclesById, vehiclesByTripId);
            }
          }

          response.departures = departures;
          response.source = 'api';
          response.api_tier_used = true;
          this.lastStatus.api_tier_used = true;
          return response;
        }

        response.fallback_reason = 'api_empty';
      } catch (err) {
        if (err instanceof BusTimeApiError) {
          response.fallback_reason = err.reason;
        } else {
          response.fallback_reason = 'api_error';
        }
      }
    } else {
      response.fallback_reason = 'missing_auth';
    }

    const rtDepartures = await this.gtfsRtAdapter.getPredictionsForStop({
      stopId: args.stop_id,
      routeId: args.route_id,
      limit: args.limit || 5
    });

    if (rtDepartures.length > 0) {
      response.departures = rtDepartures;
      response.source = 'gtfs_rt';
      return response;
    }

    const scheduled = this.gtfsStaticAdapter.getScheduledDepartures({
      stopId: args.stop_id,
      routeId: args.route_id,
      limit: args.limit || 5,
      withinMinutes: args.within_minutes
    });

    response.departures = scheduled;
    response.source = 'schedule';
    return response;
  }

  async vehiclePositions(args, authCtx) {
    const result = {
      vehicles: [],
      api_auth_required: true,
      api_auth_present: Boolean(authCtx.metroApiKey),
      source: 'gtfs_rt',
      fallback_reason: undefined,
      api_tier_used: false
    };

    if (authCtx.metroApiKey) {
      try {
        let vehicles = [];

        if (args.route_id) {
          vehicles = await this.busTimeAdapter.getVehicles({ key: authCtx.metroApiKey, routeId: args.route_id });
        } else {
          const routes = await this.busTimeAdapter.getRoutes({ key: authCtx.metroApiKey });
          const vehicleGroups = await Promise.all(
            routes.map((route) => this.busTimeAdapter.getVehicles({ key: authCtx.metroApiKey, routeId: route.rt }))
          );
          vehicles = vehicleGroups.flat();
        }

        if (vehicles.length > 0) {
          const deduped = Array.from(new Map(vehicles.map((vehicle) => [String(vehicle.vid), vehicle])).values());
          result.vehicles = deduped.slice(0, Number(args.limit || 50)).map(mapBusTimeVehicle);
          result.source = 'api';
          result.api_tier_used = true;
          this.lastStatus.api_tier_used = true;
          return result;
        }
        result.fallback_reason = 'api_empty';
      } catch (err) {
        result.fallback_reason = err instanceof BusTimeApiError ? err.reason : 'api_error';
      }
    } else {
      result.fallback_reason = 'missing_auth';
    }

    result.vehicles = await this.gtfsRtAdapter.getVehiclePositions({ routeId: args.route_id, limit: args.limit || 50 });
    return result;
  }

  async serviceAlerts(args, authCtx) {
    const result = {
      alerts: [],
      api_auth_required: true,
      api_auth_present: Boolean(authCtx.metroApiKey),
      source: 'gtfs_rt',
      fallback_reason: undefined,
      api_tier_used: false
    };

    if (authCtx.metroApiKey) {
      try {
        const hasFilter = Boolean(args.route_id || args.stop_id);
        const [bulletins, detours] = await Promise.all([
          hasFilter ? this.busTimeAdapter.getServiceBulletins({ key: authCtx.metroApiKey, routeId: args.route_id, stopId: args.stop_id }) : Promise.resolve([]),
          this.busTimeAdapter.getDetours({ key: authCtx.metroApiKey, routeId: args.route_id })
        ]);

        const apiAlerts = [...bulletins.map(mapBulletin), ...detours.map(mapDetour)];
        if (apiAlerts.length > 0) {
          result.alerts = apiAlerts;
          result.source = 'api';
          result.api_tier_used = true;
          this.lastStatus.api_tier_used = true;
          return result;
        }

        result.fallback_reason = 'api_empty';
      } catch (err) {
        result.fallback_reason = err instanceof BusTimeApiError ? err.reason : 'api_error';
      }
    } else {
      result.fallback_reason = 'missing_auth';
    }

    result.alerts = await this.gtfsRtAdapter.getAlerts({ routeId: args.route_id, stopId: args.stop_id });
    return result;
  }

  async #getAllApiStops(key) {
    const now = Date.now();
    if (this.apiStopCache.stops.length > 0 && now - this.apiStopCache.fetchedAtMs < 5 * 60 * 1000) {
      return this.apiStopCache.stops;
    }

    const routes = await this.busTimeAdapter.getRoutes({ key });
    const stopPairs = await Promise.all(
      routes.map(async (route) => {
        const routeId = route.rt;
        const directions = await this.busTimeAdapter.getDirections({ key, routeId });
        const directionTokens = directions.map(normalizeDirectionToken).filter(Boolean);
        const stopGroups = await Promise.all(
          directionTokens.map((direction) => this.busTimeAdapter.getStops({ key, routeId, direction }))
        );

        return stopGroups.flat().map((stop) => mapBusTimeStop(stop, routeId));
      })
    );

    const deduped = this.#dedupeStops(stopPairs.flat());
    this.apiStopCache = {
      fetchedAtMs: now,
      stops: deduped
    };
    return deduped;
  }

  #filterStopsByGeo(stops, nearLat, nearLon, radiusMeters) {
    const lat = Number(nearLat);
    const lon = Number(nearLon);
    const radius = Number(radiusMeters || 500);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return [];
    }

    return stops
      .map((stop) => ({ stop, distance: haversineMeters(lat, lon, Number(stop.stop_lat), Number(stop.stop_lon)) }))
      .filter((item) => Number.isFinite(item.distance) && item.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .map((item) => ({ ...item.stop, distance_m: Math.round(item.distance) }));
  }

  #dedupeStops(stops) {
    const unique = new Map();
    for (const stop of stops) {
      unique.set(String(stop.stop_id), stop);
    }
    return Array.from(unique.values());
  }

  dataStatus(authCtx) {
    return {
      auth_mode: 'pass_through',
      api_auth_present: Boolean(authCtx.metroApiKey),
      api_tier_used: this.lastStatus.api_tier_used,
      static_loaded: this.gtfsStaticAdapter.loaded,
      api_auth_required: false
    };
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
