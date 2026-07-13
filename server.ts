// =====================================================================
// PortMasters 2 Parallel Release: app entry point
// A custom server so the Next.js app and the Socket.IO realtime layer
// share one HTTP server, one port, and one process, locally and in
// production. Run via `npm run dev` (local) or `npm run start` (after
// `npm run build`).
// =====================================================================
import { createServer } from "http";
import next from "next";
import { attachRealtime } from "./src/server/realtime";

// 2232 locally so the whole app (website + realtime) is reachable through one
// port, suitable for a single ngrok tunnel. Railway assigns PORT itself in
// production, which overrides this.
const port = Number(process.env.PORT) || 2232;
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  attachRealtime(httpServer);

  httpServer.listen(port, () => {
    console.log(
      `> PortMasters 2 Parallel Release ready on http://localhost:${port}`,
    );
  });
});
