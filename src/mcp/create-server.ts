import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { extractMetroApiKeyFromHeaders, extractMetroApiKeyFromToolCall } from '../lib/auth.js';
import { type MetroService } from '../metro-service.js';

const TOOLS = [
  {
    name: 'metro_routes_list',
    description: 'List Metro routes',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        active_on_date: { type: 'string' }
      }
    }
  },
  {
    name: 'metro_stops_list',
    description: 'List Metro stops by route or location',
    inputSchema: {
      type: 'object',
      properties: {
        route_id: { type: 'string' },
        direction_id: { type: 'string' },
        near_lat: { type: 'number' },
        near_lon: { type: 'number' },
        radius_m: { type: 'number' },
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'metro_next_departures',
    description: 'Get next departures for a stop using API-first predictions and GTFS fallback',
    inputSchema: {
      type: 'object',
      required: ['stop_id'],
      properties: {
        stop_id: { type: 'string' },
        route_id: { type: 'string' },
        headsign: { type: 'string' },
        limit: { type: 'number' },
        within_minutes: { type: 'number' }
      }
    }
  },
  {
    name: 'metro_vehicle_positions',
    description: 'Get live vehicle positions',
    inputSchema: {
      type: 'object',
      properties: {
        route_id: { type: 'string' },
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'metro_service_alerts',
    description: 'Get service alerts and detours',
    inputSchema: {
      type: 'object',
      properties: {
        route_id: { type: 'string' },
        stop_id: { type: 'string' }
      }
    }
  },
  {
    name: 'metro_data_status',
    description: 'Get upstream data and auth status',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
] as const;

function toToolResult(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload)
      }
    ]
  };
}

export function createMcpServer({ metroService, defaultMetroApiKey = '' }: { metroService: MetroService; defaultMetroApiKey?: string }): Server {
  const server = new Server(
    {
      name: 'madison-metro-mcp',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [...TOOLS] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const name = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;
    const metroApiKey =
      extractMetroApiKeyFromToolCall({
        authorization: (request.params as { authorization?: string }).authorization,
        _meta: request.params._meta as { authorization?: string } | undefined,
        arguments: args as {
          authorization?: string;
          _meta?: {
            authorization?: string;
          };
        }
      }) ||
      extractMetroApiKeyFromHeaders(extra.requestInfo?.headers) ||
      defaultMetroApiKey ||
      undefined;

    const authCtx = { metroApiKey };

    try {
      let payload: unknown;
      switch (name) {
        case 'metro_routes_list':
          payload = await metroService.routesList(args as { query?: string; active_on_date?: string }, authCtx);
          break;
        case 'metro_stops_list':
          payload = await metroService.stopsList(
            args as {
              route_id?: string;
              direction_id?: string;
              near_lat?: number;
              near_lon?: number;
              radius_m?: number;
              limit?: number;
            },
            authCtx
          );
          break;
        case 'metro_next_departures':
          payload = await metroService.nextDepartures(
            args as {
              stop_id: string;
              route_id?: string;
              headsign?: string;
              limit?: number;
              within_minutes?: number;
            },
            authCtx
          );
          break;
        case 'metro_vehicle_positions':
          payload = await metroService.vehiclePositions(args as { route_id?: string; limit?: number }, authCtx);
          break;
        case 'metro_service_alerts':
          payload = await metroService.serviceAlerts(args as { route_id?: string; stop_id?: string }, authCtx);
          break;
        case 'metro_data_status':
          payload = metroService.dataStatus(authCtx);
          break;
        default:
          throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
      }

      return toToolResult(payload);
    } catch (err: unknown) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
          }
        ]
      };
    }
  });

  return server;
}
