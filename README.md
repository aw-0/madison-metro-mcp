# Madison Metro MCP

MCP server for Madison Metro that prioritizes BusTime API predictions using credential pass-through.

## Auth model

- Client sends `Authorization: Bearer <metro_bustime_api_key>` per MCP request metadata.
- Server forwards bearer token value to BusTime as `key=<token>`.
- For local testing, if no bearer token is present and `MADISON_BUSTIME_API_KEY` is configured, the server uses that value as a fallback BusTime key.
- If neither is available, BusTime-backed tools fall back to GTFS-RT and static GTFS where available.

## Environment

- `MADISON_BUSTIME_BASE_URL` (default: `https://metromap.cityofmadison.com/bustime/api/v3`)
- `MADISON_BUSTIME_API_KEY` (optional fallback key for local testing)
- `MADISON_GTFS_URL` (default: `https://www.cityofmadison.com/metro/documents/mmt_gtfs.zip`)
- `MADISON_GTFS_RT_TRIP_UPDATES_URL` (optional)
- `MADISON_GTFS_RT_VEHICLE_POSITIONS_URL` (optional)
- `MADISON_GTFS_RT_ALERTS_URL` (optional)
- `MADISON_GTFS_STATIC_SNAPSHOT_PATH` (optional local JSON fallback snapshot)
- `MADISON_GTFS_STATIC_SNAPSHOT_URL` (optional remote JSON fallback snapshot)
- `MADISON_API_TIMEOUT_MS` (default: `2500`)
- `MADISON_API_CACHE_SECONDS` (default: `10`)

## Running

```bash
npm start
```

## Testing

```bash
npm test
```

## Capacity Fields

When BusTime provides passenger load (`psgld`), API-backed responses include:

- `capacity_load_raw`: raw upstream value (for example `EMPTY`, `67%`)
- `capacity_level`: normalized bucket (`empty`, `low`, `medium`, `high`, `full`, `unknown`)
- `capacity_percent`: normalized numeric percentage when derivable, otherwise `null`

These fields are available on:

- `metro_next_departures` departure items
- `metro_vehicle_positions` vehicle items

For departures, if prediction rows omit `psgld`, the server backfills capacity from live vehicle data using `vid` when available.
