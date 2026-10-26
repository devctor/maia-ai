import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The monorepo root is the tracing root: the app imports the workspace package
  // `@maia/contracts`, whose files live outside `apps/web`.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  env: {
    // The browser calls the API directly, so the URL is public by definition and has to be
    // inlined at build time. The default keeps `next build` working with no env file at all.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
