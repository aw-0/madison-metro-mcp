import { createServer } from 'node:http';
import { handleMcpHttp } from './http/handleMcpHttp.js';

const port = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  await handleMcpHttp(req, res);
});

server.listen(port, () => {
  console.log(`Madison Metro MCP HTTP server listening on :${port}`);
});
