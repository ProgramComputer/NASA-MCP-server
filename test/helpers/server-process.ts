import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * How to launch the server under test. Defaults to this checkout's build;
 * the package gate points NASA_MCP_SERVER_COMMAND at an installed tarball's
 * bin shim so the exact artifact is exercised.
 */
export function serverCommand(): { command: string; args: string[] } {
  const command = process.env.NASA_MCP_SERVER_COMMAND;
  if (command) {
    return { command, args: process.env.NASA_MCP_SERVER_ARGS ? (JSON.parse(process.env.NASA_MCP_SERVER_ARGS) as string[]) : [] };
  }
  return { command: process.execPath, args: [resolve(__dirname, '..', '..', '..', 'dist', 'index.js')] };
}

/** Environment for spawned servers: no real credentials, local mock CMR. */
export function serverEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.NASA_API_KEY;
  delete env.FIRMS_MAP_KEY;
  return env;
}

export function spawnServer(extra: Record<string, string>, cwd?: string): ChildProcessWithoutNullStreams {
  const { command, args } = serverCommand();
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  return spawn(needsShell ? `"${command}"` : command, args, {
    env: serverEnv(extra),
    cwd,
    shell: needsShell,
    stdio: 'pipe'
  });
}

/**
 * Stops a spawned server. On Windows an npm .cmd shim runs node under cmd.exe,
 * and killing cmd.exe would orphan the server, so the whole tree is terminated.
 */
export function stopServer(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

export function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<number | null> {
  return new Promise((resolvePromise, reject) => {
    if (child.exitCode !== null) {
      resolvePromise(child.exitCode);
      return;
    }
    const timer = setTimeout(() => reject(new Error(`server did not exit within ${timeoutMs} ms`)), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolvePromise(code);
    });
  });
}
