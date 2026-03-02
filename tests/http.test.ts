import { expect, test } from 'bun:test';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleMcpHttp } from '../src/http/handleMcpHttp.js';

type JsonRpcMessage = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

const httpTest = process.env.RUN_HTTP_INTEGRATION_TESTS === '1' ? test.serial : test.skip;

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    await handleMcpHttp(req, res);
  });

  const port = 41000 + Math.floor(Math.random() * 10000);
  server.listen({ port, host: '127.0.0.1' });
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve HTTP test address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: { serverInfo?: { name?: string }; tools?: { name: string }[]; content?: { type: string; text: string }[] };
};

async function postJsonRpc(baseUrl: string, body: JsonRpcMessage): Promise<{ status: number; json: JsonRpcResponse }> {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    json: (await response.json()) as JsonRpcResponse
  };
}

httpTest('initialize returns protocol information over HTTP MCP endpoint', async () => {
  await withServer(async (baseUrl) => {
    const response = await postJsonRpc(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '0.1.0'
        }
      }
    });

    expect(response.status).toBe(200);
    expect(response.json.jsonrpc).toBe('2.0');
    expect(response.json.id).toBe(1);
    expect(response.json.result?.serverInfo?.name).toBe('madison-metro-mcp');
  });
});

httpTest('tools/list returns expected metro tools', async () => {
  await withServer(async (baseUrl) => {
    const response = await postJsonRpc(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });

    expect(response.status).toBe(200);
    const names = response.json.result?.tools?.map((tool: { name: string }) => tool.name) ?? [];
    expect(names).toContain('metro_routes_list');
    expect(names).toContain('metro_data_status');
  });
});

httpTest('tools/call metro_data_status returns MCP text payload', async () => {
  await withServer(async (baseUrl) => {
    const response = await postJsonRpc(baseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'metro_data_status',
        arguments: {}
      }
    });

    expect(response.status).toBe(200);
    expect(response.json.result?.content?.[0]?.type).toBe('text');

    const payload = JSON.parse(response.json.result?.content?.[0]?.text ?? '{}');
    expect(payload.auth_mode).toBe('pass_through');
    expect(typeof payload.static_loaded).toBe('boolean');
  });
});

httpTest('parallel requests are isolated in stateless mode', async () => {
  await withServer(async (baseUrl) => {
    const requests = Array.from({ length: 5 }).map((_, index) =>
      postJsonRpc(baseUrl, {
        jsonrpc: '2.0',
        id: 100 + index,
        method: 'tools/call',
        params: {
          name: 'metro_data_status',
          arguments: {}
        }
      })
    );

    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.json.result?.content?.[0]?.type).toBe('text');
    }
  });
});
