import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next's dev server blocks cross-origin requests to its internal /_next/*
  // assets by default (anything not "localhost"), which silently breaks the
  // app when tunneled through ngrok for sharing. Allowlist ngrok's domains.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
