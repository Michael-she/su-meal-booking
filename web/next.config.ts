import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next 16 runs `next build` on Turbopack by default, and hard-errors when a
  // `webpack` config is present with no `turbopack` config — which broke
  // `npm run build` outright. The webpack block below is dev-only (it guards
  // on `dev`), so there is nothing to migrate: an empty turbopack config just
  // states that Turbopack needs no customisation, letting production builds
  // use it while `next dev --webpack` keeps the watchOptions fix.
  turbopack: {},
  // `logging: false` (and the narrower `browserToTerminal: false`) does NOT
  // reliably stop Next from writing to .next/dev/logs/next-development.log —
  // confirmed by watching that file keep growing with both settings in
  // place. Since that file lives inside the dev server's watched directory,
  // every write to it (including ones caused by a reload itself) triggers
  // another Fast Refresh reload, which issues more requests, which write
  // more log lines: a self-sustaining reload loop. Rather than depend on a
  // logging flag that doesn't actually suppress the writes, tell webpack's
  // own watcher to ignore that directory outright, so writes to it can't
  // trigger a rebuild regardless of what Next's dev logging does.
  logging: false,
  webpack: (config, { dev }) => {
    if (dev) {
      // Next's own default here is a RegExp (matching node_modules etc), and
      // webpack's schema rejects mixing a RegExp into a string array — so
      // replace it outright with a single RegExp that still covers the
      // default exclusions plus the log directory, rather than trying to
      // merge two incompatible shapes.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /[\\/](node_modules|\.git)[\\/]|[\\/]\.next[\\/]dev[\\/]logs[\\/]/,
      };
    }
    return config;
  },
};

export default nextConfig;
