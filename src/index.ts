#!/usr/bin/env node
import dotenv from 'dotenv';
import { loadConfig } from './config';
import { startHttp, startStdio, type RunningServer } from './transports';
import { SERVER_VERSION } from './version';

export { createNasaMcpServer, type CreateServerOptions, type NasaMcpServer } from './server';
export { startHttp, startStdio } from './transports';
export { loadConfig, type ServerConfig } from './config';
export { listTools, resolveTool, TOOL_DEFINITIONS } from './tools/registry';
export { SERVER_VERSION } from './version';

const HELP = `nasa-mcp-server ${SERVER_VERSION}

Model Context Protocol server for NASA and JPL public APIs.

Usage: nasa-mcp-server [--nasa-api-key KEY] [--firms-map-key KEY] [--version] [--help]

Environment:
  NASA_API_KEY      api.nasa.gov key (APOD, NEO, DONKI, Mars Rover Photos)
  FIRMS_MAP_KEY     FIRMS MAP_KEY (nasa_firms)
  MCP_TRANSPORT     stdio (default) or http
  MCP_HTTP_HOST     HTTP bind host (default 127.0.0.1)
  MCP_HTTP_PORT     HTTP port (default 3000; PORT is also honoured)
  MCP_HTTP_PATH     HTTP endpoint path (default /mcp)
  NASA_MCP_CMR_URL  CMR search root override (https, or http on localhost)
`;

function log(message: string): void {
  // stdout carries MCP protocol messages in stdio mode; diagnostics go to stderr.
  process.stderr.write(`${message}\n`);
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<RunningServer | undefined> {
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return undefined;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return undefined;
  }

  // Optional .env in the working directory; never overrides real environment
  // variables and never prints (quiet) because stdout is the protocol stream.
  dotenv.config({ quiet: true });
  const config = loadConfig(env, argv);
  const transport = (env.MCP_TRANSPORT ?? 'stdio').toLowerCase();

  if (transport === 'stdio') {
    const running = await startStdio({ config });
    const shutdown = () => {
      void running.close().finally(() => process.exit(0));
    };
    process.stdin.on('end', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return running;
  }

  if (transport === 'http' || transport === 'streamable-http' || transport === 'streamable_http') {
    const port = Number.parseInt(env.MCP_HTTP_PORT ?? env.PORT ?? '3000', 10);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('MCP_HTTP_PORT/PORT must be an integer port number');
    const running = await startHttp({ config, host: env.MCP_HTTP_HOST ?? '127.0.0.1', port, path: env.MCP_HTTP_PATH ?? '/mcp' });
    log(`NASA MCP Server ${SERVER_VERSION} listening on ${running.url}`);
    const shutdown = () => {
      void running.close().finally(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return running;
  }

  throw new Error(`Unsupported MCP_TRANSPORT "${env.MCP_TRANSPORT}". Use "stdio" or "http".`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    log(`Error starting NASA MCP Server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
