import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMcpHttp } from '../src/http/handleMcpHttp.js';

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  await handleMcpHttp(req, res);
}
