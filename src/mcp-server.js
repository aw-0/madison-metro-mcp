import { extractMetroApiKeyFromToolCall } from './lib/auth.js';

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
];

export class JsonRpcMcpServer {
  constructor({
    metroService,
    defaultMetroApiKey = '',
    supportedProtocolVersion = '2025-11-25',
    input = process.stdin,
    output = process.stdout,
    logger = console
  }) {
    this.metroService = metroService;
    this.defaultMetroApiKey = defaultMetroApiKey;
    this.supportedProtocolVersion = supportedProtocolVersion;
    this.input = input;
    this.output = output;
    this.logger = logger;
    this.buffer = Buffer.alloc(0);
    this.transportMode = null;
  }

  start() {
    this.input.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.#processBuffer().catch((err) => {
        this.logger.error('MCP buffer processing error', err);
      });
    });
  }

  async #processBuffer() {
    while (true) {
      if (!this.transportMode) {
        this.transportMode = this.#detectTransportMode();
        if (!this.transportMode) {
          return;
        }
      }

      if (this.transportMode === 'jsonl') {
        const lineEnd = this.buffer.indexOf('\n');
        if (lineEnd === -1) {
          return;
        }

        const line = this.buffer.subarray(0, lineEnd).toString('utf8').trim();
        this.buffer = this.buffer.subarray(lineEnd + 1);

        if (!line) {
          continue;
        }

        let message;
        try {
          message = JSON.parse(line);
        } catch {
          this.logger.warn('Unable to parse JSON-RPC JSONL payload');
          continue;
        }

        await this.#handleMessage(message);
        continue;
      }

      const delimiter = this.#findHeaderDelimiter();
      if (!delimiter) {
        return;
      }
      const { headerEnd, delimiterLength } = delimiter;

      const headerText = this.buffer.subarray(0, headerEnd).toString('utf8');
      const headers = new Map();
      for (const line of headerText.split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
        }
      }

      const lengthValue = headers.get('content-length');
      const contentLength = Number.parseInt(lengthValue || '', 10);
      if (!Number.isFinite(contentLength) || contentLength < 0) {
        this.logger.warn('Invalid Content-Length header');
        this.buffer = this.buffer.subarray(headerEnd + delimiterLength);
        continue;
      }

      const totalLength = headerEnd + delimiterLength + contentLength;
      if (this.buffer.length < totalLength) {
        return;
      }

      const payload = this.buffer.subarray(headerEnd + delimiterLength, totalLength).toString('utf8');
      this.buffer = this.buffer.subarray(totalLength);

      let message;
      try {
        message = JSON.parse(payload);
      } catch {
        this.logger.warn('Unable to parse JSON-RPC payload');
        continue;
      }

      await this.#handleMessage(message);
    }
  }

  #detectTransportMode() {
    const preview = this.buffer.toString('utf8').trimStart();
    if (!preview) {
      return null;
    }

    if (preview.startsWith('Content-Length:')) {
      return 'header';
    }

    if (preview.startsWith('{')) {
      return 'jsonl';
    }

    return null;
  }

  #findHeaderDelimiter() {
    const crlf = this.buffer.indexOf('\r\n\r\n');
    if (crlf !== -1) {
      return { headerEnd: crlf, delimiterLength: 4 };
    }

    const lf = this.buffer.indexOf('\n\n');
    if (lf !== -1) {
      return { headerEnd: lf, delimiterLength: 2 };
    }

    return null;
  }

  async #handleMessage(message) {
    if (!message?.method) {
      return;
    }

    if (message.method === 'notifications/initialized') {
      return;
    }

    if (message.method === 'initialize') {
      await this.metroService.initialize();
      const protocolVersion =
        typeof message?.params?.protocolVersion === 'string' && message.params.protocolVersion.length > 0
          ? message.params.protocolVersion
          : this.supportedProtocolVersion;

      return this.#sendResult(message.id, {
        protocolVersion,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'madison-metro-mcp',
          version: '0.1.0'
        }
      });
    }

    if (message.method === 'tools/list') {
      return this.#sendResult(message.id, { tools: TOOLS });
    }

    if (message.method === 'tools/call') {
      return this.#handleToolCall(message);
    }

    return this.#sendError(message.id, -32601, `Method not found: ${message.method}`);
  }

  async #handleToolCall(message) {
    const name = message?.params?.name;
    const args = message?.params?.arguments || {};
    const metroApiKey = extractMetroApiKeyFromToolCall(message.params) || this.defaultMetroApiKey || undefined;
    const authCtx = { metroApiKey };

    try {
      let payload;
      switch (name) {
        case 'metro_routes_list':
          payload = await this.metroService.routesList(args, authCtx);
          break;
        case 'metro_stops_list':
          payload = await this.metroService.stopsList(args, authCtx);
          break;
        case 'metro_next_departures':
          payload = await this.metroService.nextDepartures(args, authCtx);
          break;
        case 'metro_vehicle_positions':
          payload = await this.metroService.vehiclePositions(args, authCtx);
          break;
        case 'metro_service_alerts':
          payload = await this.metroService.serviceAlerts(args, authCtx);
          break;
        case 'metro_data_status':
          payload = this.metroService.dataStatus(authCtx);
          break;
        default:
          return this.#sendError(message.id, -32602, `Unknown tool: ${name}`);
      }

      return this.#sendResult(message.id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload)
          }
        ]
      });
    } catch (err) {
      return this.#sendResult(message.id, {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: err?.message || String(err) })
          }
        ]
      });
    }
  }

  #sendResult(id, result) {
    if (id == null) return;
    this.#send({ jsonrpc: '2.0', id, result });
  }

  #sendError(id, code, message) {
    if (id == null) return;
    this.#send({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    });
  }

  #send(json) {
    if (this.transportMode === 'jsonl') {
      this.output.write(`${JSON.stringify(json)}\n`);
      return;
    }

    const body = Buffer.from(JSON.stringify(json), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\nContent-Type: application/json\r\n\r\n`, 'utf8');
    this.output.write(Buffer.concat([header, body]));
  }
}
