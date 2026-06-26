// PortMasters 2 Parallel Release: Prisma CLI config
// Prisma 7 moved the datasource connection string for the CLI (migrate, db
// push, studio) out of schema.prisma and into this file. The app itself
// still reads DATABASE_URL directly when it builds its driver adapter (see
// src/lib/db.ts); this is the same value, just for the CLI's own use.
import { defineConfig, env } from "prisma/config";

// Unlike the old schema-based env(), loading prisma.config.ts doesn't pull
// in .env on its own. Locally that file exists and carries DATABASE_URL;
// in production (Railway) DATABASE_URL is set directly in the environment
// and there's no .env file at all, so a missing file here is expected and
// not an error.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
  },
});
