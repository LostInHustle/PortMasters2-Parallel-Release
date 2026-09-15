// =====================================================================
// Orchestrates the E2E scenario suite: spins up one isolated instance of
// the app (see server.ts), runs every scenario against it with a real
// Chromium browser, then tears both down. Slower and heavier than the
// pure logic suites (unit/effects/integration/harbor/convoy/backing), so
// it's wired to its own `npm run test:e2e` rather than folded into the
// default `npm test`.
// =====================================================================
import { startTestServer } from "./server";
import { closeBrowser } from "./browser";
import { summary } from "./harness";
import { run as notificationCap } from "./scenarios/notificationCap";
import { run as multiplayerReadyGate } from "./scenarios/multiplayerReadyGate";
import { run as reloadMidVoyage } from "./scenarios/reloadMidVoyage";
import { run as rapidActions } from "./scenarios/rapidActions";
import { run as barterAndChat } from "./scenarios/barterAndChat";
import { run as adminConsole } from "./scenarios/adminConsole";

async function main() {
  console.log("Starting an isolated app instance for the E2E suite...");
  const server = await startTestServer();
  console.log(`Ready at ${server.baseUrl}`);

  try {
    await notificationCap(server.baseUrl);
    await multiplayerReadyGate(server.baseUrl);
    await reloadMidVoyage(server.baseUrl);
    await rapidActions(server.baseUrl);
    await barterAndChat(server.baseUrl);
    await adminConsole(server.baseUrl);
  } finally {
    await closeBrowser();
    await server.stop();
  }

  const ok = summary();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E suite crashed:", err);
  process.exit(1);
});
