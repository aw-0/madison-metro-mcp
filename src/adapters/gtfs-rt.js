export class GtfsRtAdapter {
  constructor({ tripUpdatesUrl = '', vehiclePositionsUrl = '', alertsUrl = '', fetchImpl = fetch, logger = console }) {
    this.tripUpdatesUrl = tripUpdatesUrl;
    this.vehiclePositionsUrl = vehiclePositionsUrl;
    this.alertsUrl = alertsUrl;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async getPredictionsForStop({ stopId, routeId, limit = 5 }) {
    const feed = await this.#fetchEntities(this.tripUpdatesUrl);
    if (feed.length === 0) {
      return [];
    }

    const departures = [];
    for (const entity of feed) {
      const tripUpdate = entity.trip_update;
      if (!tripUpdate) {
        continue;
      }

      const routeMatches = !routeId || tripUpdate?.trip?.route_id === String(routeId);
      if (!routeMatches) {
        continue;
      }

      const stopTimes = tripUpdate.stop_time_update || [];
      for (const update of stopTimes) {
        if (String(update.stop_id) !== String(stopId)) {
          continue;
        }

        const predictedEpoch = update?.arrival?.time || update?.departure?.time;
        if (!predictedEpoch) {
          continue;
        }

        departures.push({
          stop_id: String(stopId),
          route_id: tripUpdate?.trip?.route_id || undefined,
          trip_id: tripUpdate?.trip?.trip_id || undefined,
          predicted_time: new Date(Number(predictedEpoch) * 1000).toISOString(),
          source: 'gtfs_rt',
          confidence: 'medium'
        });
      }
    }

    departures.sort((a, b) => new Date(a.predicted_time).getTime() - new Date(b.predicted_time).getTime());
    return departures.slice(0, limit);
  }

  async getVehiclePositions({ routeId, limit = 50 }) {
    const feed = await this.#fetchEntities(this.vehiclePositionsUrl);
    const positions = [];

    for (const entity of feed) {
      const vehicle = entity.vehicle;
      if (!vehicle?.position) {
        continue;
      }

      const route = vehicle?.trip?.route_id;
      if (routeId && String(routeId) !== String(route)) {
        continue;
      }

      positions.push({
        vehicle_id: vehicle?.vehicle?.id || entity.id,
        route_id: route || undefined,
        trip_id: vehicle?.trip?.trip_id || undefined,
        lat: vehicle.position.latitude,
        lon: vehicle.position.longitude,
        bearing: vehicle.position.bearing,
        timestamp: vehicle.timestamp ? new Date(Number(vehicle.timestamp) * 1000).toISOString() : undefined,
        source: 'gtfs_rt'
      });
    }

    return positions.slice(0, limit);
  }

  async getAlerts({ routeId, stopId }) {
    const feed = await this.#fetchEntities(this.alertsUrl);
    const alerts = [];

    for (const entity of feed) {
      const alert = entity.alert;
      if (!alert) {
        continue;
      }

      const informed = alert.informed_entity || [];
      const routeMatches = !routeId || informed.some((item) => String(item.route_id) === String(routeId));
      const stopMatches = !stopId || informed.some((item) => String(item.stop_id) === String(stopId));

      if (!routeMatches || !stopMatches) {
        continue;
      }

      const title = alert?.header_text?.translation?.[0]?.text || 'GTFS-RT alert';
      const description = alert?.description_text?.translation?.[0]?.text || '';

      alerts.push({
        id: entity.id,
        title,
        description,
        source: 'gtfs_rt'
      });
    }

    return alerts;
  }

  async #fetchEntities(url) {
    if (!url) {
      return [];
    }

    try {
      const response = await this.fetchImpl(url);
      if (!response.ok) {
        this.logger.warn(`GTFS-RT fetch failed: ${response.status}`);
        return [];
      }

      const json = await response.json();
      const entities = json?.entity || [];
      return Array.isArray(entities) ? entities : [];
    } catch (err) {
      this.logger.warn(`GTFS-RT fetch error: ${err?.message || err}`);
      return [];
    }
  }
}
