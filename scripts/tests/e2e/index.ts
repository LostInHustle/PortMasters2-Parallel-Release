// =====================================================================
// Orchestrates the E2E scenario suite: spins up one isolated instance of
// the app (see server.ts), runs every scenario against it with a real
// Chromium browser, then tears both down. Slower and heavier than the
// pure-logic suites (unit/effects/integration/harbor/convoy/backing), so
// it's wired to its own `npm run test:e2e` rather than folded into the
// default `npm test`.
// =====================================================================
import { startTestServer } from "./server";
import { closeBrowser } from "./browser";
import { summary } from "./harness";
import { run as notificationCap } from "./scenarios/notification-cap";
import { run as multiplayerReadyGate } from "./scenarios/multiplayer-ready-gate";
import { run as reloadMidVoyage } from "./scenarios/reload-midvoyage";
import { run as rapidActions } from "./scenarios/rapid-actions";
import { run as barterAndChat } from "./scenarios/barter-and-chat";

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
