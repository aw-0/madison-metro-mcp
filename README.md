# Madison Metro MCP

MCP server for Madison Metro that prioritizes BusTime API predictions using credential pass-through.

## Auth model

- Client sends `Authorization: Bearer <metro_bustime_api_key>` in MCP request metadata (`_meta.authorization`) or tool arguments (`authorization`).
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

## Bun setup

```bash
bun install
```

## Run locally

```bash
bun run dev
```

The MCP HTTP endpoint is available at `http://localhost:3000/api/mcp`.

## Test With MCP Inspector (Stainless Workflow)

1. Start the server:

```bash
bun run mcp:server
```

2. In a second terminal, open MCP Inspector using the checked-in config:

```bash
bun run mcp:inspector
```

This uses [mcp.inspector.local.json](/Users/andrew/Desktop/Code/madison-metro-mcp/mcp.inspector.local.json) and connects to `http://localhost:3000/api/mcp`.

If you need BusTime auth pass-through, provide `Authorization: Bearer <your_key>` in tool metadata/arguments during calls.

## Typecheck

```bash
bun run typecheck
```

## Testing

```bash
bun test
```

HTTP integration tests are included but skipped by default in constrained environments. Run them with:

```bash
RUN_HTTP_INTEGRATION_TESTS=1 bun test tests/http.test.ts
```

## Deploy to Vercel

1. Create a Vercel project from this repository.
2. Set required environment variables in Vercel project settings.
3. Deploy.
4. Use the MCP endpoint at `/api/mcp`.

`vercel.json` pins the function runtime to Node.js 20.

## Capacity Fields

When BusTime provides passenger load (`psgld`), API-backed responses include:

- `capacity_load_raw`: raw upstream value (for example `EMPTY`, `67%`)
- `capacity_level`: normalized bucket (`empty`, `low`, `medium`, `high`, `full`, `unknown`)
- `capacity_percent`: normalized numeric percentage when derivable, otherwise `null`

These fields are available on:

- `metro_next_departures` departure items
- `metro_vehicle_positions` vehicle items

For departures, if prediction rows omit `psgld`, the server backfills capacity from live vehicle data using `vid` when available.
