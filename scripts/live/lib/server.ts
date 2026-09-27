/**Starts and stops a real copy of the WebPass server for the live checks.

Each copy gets its own port and its own fresh database file, so checks never
share state by accident. The server is the same code that runs in production
(src/server.ts), not a test double.
*/

import { ChildProcess, execSync, spawn } from 'child_process';
import { createWriteStream, existsSync, rmSync, WriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface ServerOptions {
  label: string;
  port: number;
  /** Extra environment settings on top of the runner's own. */
  env?: Record<string, string>;
  logFile: string;
}

export class LiveServer {
  readonly baseUrl: string;
  readonly dbPath: string;
  private child?: ChildProcess;
  private log?: WriteStream;
  private exitCode: number | null = null;
  private output = '';

  constructor(private options: ServerOptions) {
    this.baseUrl = `http://localhost:${options.port}`;
    this.dbPath = join(tmpdir(), `webpass-live-${options.label}-${Date.now()}.sqlite`);
  }

  /** Start the server and wait until it answers /health.

  Raises:
      Error: If it exits early or does not answer within 90 seconds.
  */
  async start(): Promise<void> {
    this.log = createWriteStream(this.options.logFile);
    this.child = spawn('npx', ['tsx', 'src/server.ts'], {
      shell: true,
      env: {
        ...process.env,
        PORT: String(this.options.port),
        DB_PATH: this.dbPath,
        ...this.options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk: Buffer): void => {
      this.output += chunk.toString();
      this.log?.write(chunk);
    };
    this.child.stdout?.on('data', collect);
    this.child.stderr?.on('data', collect);
    this.child.on('exit', (code) => {
      this.exitCode = code ?? -1;
    });

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (this.exitCode !== null) {
        throw new Error(`server ${this.options.label} exited early (code ${this.exitCode}): ${this.output.slice(-300)}`);
      }
      try {
        const response = await fetch(`${this.baseUrl}/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // not up yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`server ${this.options.label} did not become healthy in time`);
  }

  /** Everything the server has printed so far. */
  get logText(): string {
    return this.output;
  }

  /** Stop the server, its child processes, and delete its database file. */
  async stop(): Promise<void> {
    if (this.child?.pid && this.exitCode === null) {
      try {
        execSync(`taskkill /PID ${this.child.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // already gone
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.log?.end();
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${this.dbPath}${suffix}`;
      if (existsSync(file)) {
        try {
          rmSync(file, { force: true });
        } catch {
          // still locked, leave it in the temp folder
        }
      }
    }
  }
}

/** Start a server that is expected to refuse to start, and report how it ended.

Args:
    options (ServerOptions): Port, environment, and log file.

Returns:
    Promise<{ exited: boolean; code: number | null; output: string }>: Whether
        it exited on its own within 30 seconds, its exit code, and what it printed.
*/
export async function startExpectingRefusal(
  options: ServerOptions
): Promise<{ exited: boolean; code: number | null; output: string }> {
  const server = new LiveServer(options);
  try {
    await server.start();
    return { exited: false, code: null, output: server.logText };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /exited early \(code (-?\d+)\)/.exec(message);
    return { exited: match !== null, code: match ? Number(match[1]) : null, output: server.logText || message };
  } finally {
    await server.stop();
  }
}
