import ngrok from "@ngrok/ngrok";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { loadScriptEnv } from "./load-script-env";

loadScriptEnv("Phone preview", ["NGROK_AUTHTOKEN"]);

const port = readPort(process.env.PORT ?? process.env.NGROK_PORT, 3000);
const localUrl = `http://127.0.0.1:${port}`;
const bindHost = process.env.PHONE_BIND_HOST || "0.0.0.0";
let nextProcess: ChildProcess | undefined;
let listener: Awaited<ReturnType<typeof ngrok.forward>> | undefined;
let shuttingDown = false;
let keepAliveInterval: NodeJS.Timeout | undefined;

async function main() {
  if (!process.env.NGROK_AUTHTOKEN) {
    console.error("");
    console.error("NGROK_AUTHTOKEN is required for phone preview.");
    console.error("Add it to .env.local or set it in PowerShell, then run npm run dev:phone again.");
    console.error("");
    console.error("Example .env.local:");
    console.error("NGROK_AUTHTOKEN=your_ngrok_token_here");
    process.exitCode = 1;
    return;
  }

  const alreadyRunning = await isServerReady();

  if (!alreadyRunning) {
    nextProcess = startNextDev();
    await waitForServer();
  }

  listener = await ngrok.forward({
    addr: localUrl,
    authtoken_from_env: true,
    domain: process.env.NGROK_DOMAIN || undefined,
    metadata: "ai-car-classifieds-feed phone preview"
  });

  console.log("");
  console.log("Phone preview is ready:");
  console.log(`Local:  ${localUrl}`);
  getLanUrls(port).forEach((url) => console.log(`Wi-Fi:  ${url}`));
  console.log(`Phone:  ${listener.url()}`);
  console.log("");
  console.log("Use the Wi-Fi URL when your phone is on the same network.");
  console.log("Ngrok free warning pages can block Next.js JavaScript chunks, which makes buttons look dead.");
  console.log("Press Ctrl+C here to stop the tunnel.");

  await waitUntilStopped();
}

function startNextDev() {
  const nextBin = resolve(
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );

  if (!existsSync(nextBin)) {
    throw new Error("Could not find local Next.js binary. Run npm install first.");
  }

  return spawn(process.execPath, [nextBin, "dev", "-H", bindHost, "-p", String(port)], {
    env: process.env,
    shell: false,
    stdio: "inherit"
  });
}

async function waitForServer(timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady()) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`Next.js did not respond at ${localUrl} within ${timeoutMs / 1000}s.`);
}

async function isServerReady() {
  try {
    const response = await fetch(localUrl, { method: "HEAD" });
    return response.ok || response.status === 404 || response.status === 405;
  } catch {
    return false;
  }
}

async function waitUntilStopped() {
  return new Promise<void>((resolvePromise) => {
    keepAliveInterval = setInterval(() => undefined, 60_000);

    const stop = () => {
      void shutdown().finally(resolvePromise);
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    nextProcess?.once("exit", () => {
      if (!shuttingDown) {
        void shutdown().finally(resolvePromise);
      }
    });
  });
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("");
  console.log("Stopping phone preview...");

  if (listener) {
    await listener.close();
  }

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill();
  }
}

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function getLanUrls(portNumber: number) {
  const urls = new Set<string>();

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.add(`http://${address.address}:${portNumber}`);
      }
    }
  }

  return [...urls];
}

void main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await shutdown();
  process.exit(1);
});
