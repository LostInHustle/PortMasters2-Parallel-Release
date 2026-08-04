// =====================================================================
// Spins up a real, isolated instance of the app (its own SQLite file, its
// own port) for the E2E scenario suite to drive with an actual browser.
// Isolated rather than pointed at prisma/dev.db so a test run can never
// collide with, or leave debris in, whatever a developer is using that
// database for by hand, and so scenarios that need a saturated 500-entry
// ledger or dozens of rounds don't pollute a real save.
// =====================================================================
import { spawn, type ChildProcess } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "..", "..");

export type TestServer = {
  baseUrl: string;
  stop: () => Promise<void>;
};

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok || res.status < 500) {
          resolve();
          return;
        }
      } catch {
        // Not up yet.
      }
      if (Date.now() > deadline) {
        reject(new Error(`Server at ${url} did not become ready in time`));
        return;
      }
      setTimeout(tick, 300);
    };
    tick();
  });
}

export async function startTestServer(): Promise<TestServer> {
  const port = Number(process.env.E2E_PORT) || 2299;
  const dbPath = join(
    ROOT,
    "prisma",
    `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
  );
  const databaseUrl = `file:${dbPath}`;

  // Fresh schema on the fresh file. --url overrides prisma.config.ts's own
  // DATABASE_URL read directly, rather than relying on env var precedence
  // over whatever prisma.config.ts's process.loadEnvFile() picks up.
  await new Promise<void>((resolve, reject) => {
    const push = spawn(
      "npx",
      ["prisma", "db", "push", "--accept-data-loss", "--url", databaseUrl],
      {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "pipe",
      },
    );
    let stderr = "";
    push.stderr.on("data", (d) => (stderr += d.toString()));
    push.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma db push failed (${code}): ${stderr}`));
    });
  });

  const child: ChildProcess = spawn("npx", ["tsx", "server.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      NODE_ENV: "development",
    },
    stdio: "pipe",
  });

  const startupLog: string[] = [];
  child.stdout?.on("data", (d) => startupLog.push(d.toString()));
  child.stderr?.on("data", (d) => startupLog.push(d.toString()));

  const baseUrl = `http://localhost:${port}`;
  try {
    await waitForServer(baseUrl, 30_000);
  } catch (err) {
    child.kill();
    throw new Error(
      `${(err as Error).message}\n--- server output ---\n${startupLog.join("")}`,
    );
  }

  const stop = async () => {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
      // In case the process ignores SIGTERM (rare, but tsx watch children
      // sometimes linger), force it after a grace period.
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
        resolve();
      }, 3000);
    });
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const p = dbPath + suffix;
      if (existsSync(p)) unlinkSync(p);
    }
  };

  return { baseUrl, stop };
}
