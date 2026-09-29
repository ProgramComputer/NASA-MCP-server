import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createNasaMcpServer, type CreateServerOptions } from './server';

export interface RunningServer {
  close(): Promise<void>;
}

/** stdio: one server and one resource store for the lifetime of the process. */
export async function startStdio(options: CreateServerOptions = {}): Promise<RunningServer> {
  const { server } = createNasaMcpServer({ ...options, notifyResourceChanges: true });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { close: () => server.close() };
}

export interface HttpOptions extends CreateServerOptions {
  host?: string;
  port?: number;
  path?: string;
}

export interface RunningHttpServer extends RunningServer {
  url: string;
  httpServer: HttpServer;
}

const methodNotAllowed = {
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null
};

/**
 * Stateless Streamable HTTP: every POST gets a fresh MCP server, transport and
 * resource store, so no state (resources, cursors, notifications) is shared
 * between requests or clients. Cursors are self-contained, so pagination
 * works across requests.
 */
export async function startHttp(options: HttpOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const path = options.path ?? '/mcp';
  const logError = options.logError ?? ((message: string) => process.stderr.write(`${message}\n`));
  const app = createMcpExpressApp({ host });

  app.post(path, async (req, res) => {
    const { server } = createNasaMcpServer({ ...options, notifyResourceChanges: false });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    let closed = false;
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    };
    res.on('close', () => {
      void cleanup();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logError(`Error handling Streamable HTTP request: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
      await cleanup();
    }
  });
  app.get(path, (_req, res) => {
    res.status(405).set('Allow', 'POST').json(methodNotAllowed);
  });
  app.delete(path, (_req, res) => {
    res.status(405).set('Allow', 'POST').json(methodNotAllowed);
  });

  const httpServer = await new Promise<HttpServer>((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once('error', reject);
  });
  const address = httpServer.address() as AddressInfo;
  const displayHost = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return {
    url: `http://${displayHost}:${address.port}${path}`,
    httpServer,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.closeAllConnections?.();
        httpServer.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
