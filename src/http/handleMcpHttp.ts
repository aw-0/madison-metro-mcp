import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAppContext } from '../app.js';
import { createMcpServer } from '../mcp/create-server.js';

type BodyCapableIncomingMessage = IncomingMessage & {
  body?: unknown;
};

const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE']);

function sendJsonRpcError(res: ServerResponse, code: number, message: string): void {
  if (res.headersSent) {
    return;
  }

  res.statusCode = code === -32603 ? 500 : 405;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code,
        message
      },
      id: null
    })
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export async function handleMcpHttp(req: BodyCapableIncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || 'GET';
  if (!ALLOWED_METHODS.has(method)) {
    sendJsonRpcError(res, -32000, 'Method not allowed.');
    return;
  }

  const { metroService, defaultMetroApiKey } = await createAppContext(process.env);
  const server = createMcpServer({ metroService, defaultMetroApiKey });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  const cleanup = async (): Promise<void> => {
    await Promise.allSettled([transport.close(), server.close()]);
  };

  res.on('close', () => {
    void cleanup();
  });

  try {
    await server.connect(transport);

    let parsedBody: unknown = req.body;
    if (method === 'POST' && parsedBody === undefined) {
      parsedBody = await readJsonBody(req);
    }

    await transport.handleRequest(req, res, parsedBody);
  } catch (err: unknown) {
    console.error('Error handling MCP HTTP request', err);
    sendJsonRpcError(res, -32603, 'Internal server error');
    await cleanup();
  }
}
