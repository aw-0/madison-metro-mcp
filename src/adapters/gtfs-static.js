import fs from 'node:fs/promises';

export class GtfsStaticAdapter {
  constructor({ snapshotPath = '', snapshotUrl = '', fetchImpl = fetch, logger = console }) {
    this.snapshotPath = snapshotPath;
    this.snapshotUrl = snapshotUrl;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.loaded = false;
    this.data = {
      routes: [],
      stops: [],
      scheduleByStop: {}
    };
  }

  async refresh() {
    try {
      if (this.snapshotPath) {
        const raw = await fs.readFile(this.snapshotPath, 'utf8');
        this.#setData(JSON.parse(raw));
        return;
      }

      if (this.snapshotUrl) {
        const response = await this.fetchImpl(this.snapshotUrl);
        if (!response.ok) {
          throw new Error(`snapshot fetch failed: ${response.status}`);
        }
        this.#setData(await response.json());
        return;
      }

      this.loaded = true;
    } catch (err) {
      this.logger.warn(`GTFS static refresh failed: ${err?.message || err}`);
      this.loaded = true;
    }
  }

  listRoutes({ query } = {}) {
    const q = String(query || '').toLowerCase();
    if (!q) {
      return this.data.routes;
    }

    return this.data.routes.filter((route) => {
      return String(route.route_id || '').toLowerCase().includes(q) || String(route.route_short_name || '').toLowerCase().includes(q) || String(route.route_long_name || '').toLowerCase().includes(q);
    });
  }

  listStops({ routeId, nearLat, nearLon, radiusM = 500, limit = 50 } = {}) {
    let stops = this.data.stops;

    if (routeId) {
      stops = stops.filter((stop) => {
        if (!Array.isArray(stop.route_ids)) {
          return true;
        }
        return stop.route_ids.includes(String(routeId));
      });
    }

    if (nearLat !== undefined && nearLon !== undefined) {
      const lat = Number(nearLat);
      const lon = Number(nearLon);
      stops = stops
        .map((stop) => ({ stop, distance: haversineMeters(lat, lon, Number(stop.stop_lat), Number(stop.stop_lon)) }))
        .filter((x) => Number.isFinite(x.distance) && x.distance <= Number(radiusM))
        .sort((a, b) => a.distance - b.distance)
        .map((x) => ({ ...x.stop, distance_m: Math.round(x.distance) }));
    }

    return stops.slice(0, Number(limit));
  }

  getScheduledDepartures({ stopId, routeId, limit = 5, withinMinutes }) {
    const all = this.data.scheduleByStop[String(stopId)] || [];
    const now = Date.now();
    const maxMs = withinMinutes ? now + Number(withinMinutes) * 60_000 : Number.POSITIVE_INFINITY;

    const filtered = all
      .filter((item) => !routeId || String(item.route_id) === String(routeId))
      .map((item) => ({
        stop_id: String(stopId),
        route_id: item.route_id,
        trip_id: item.trip_id,
        scheduled_time: item.scheduled_time,
        predicted_time: null,
        delay_seconds: null,
        source: 'schedule',
        confidence: 'low'
      }))
      .filter((item) => {
        const ts = new Date(item.scheduled_time).getTime();
        return ts >= now && ts <= maxMs;
      })
      .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());

    return filtered.slice(0, Number(limit));
  }

  #setData(next) {
    this.data = {
      routes: Array.isArray(next?.routes) ? next.routes : [],
      stops: Array.isArray(next?.stops) ? next.stops : [],
      scheduleByStop: next?.scheduleByStop && typeof next.scheduleByStop === 'object' ? next.scheduleByStop : {}
    };
    this.loaded = true;
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
