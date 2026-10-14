import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  // LAN hosts allowed to load the dev server (e.g. testing on a phone); comma-separated in .env.docker
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  poweredByHeader: false,
  // dev:demo builds into its own folder, so it can run beside the Docker dev
  // server, which holds a lock on .next/dev in the same directory
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  // DB_DRIVER=pglite runs drizzle/ at start-up, so the migrations ship with the server
  outputFileTracingIncludes: { '/*': ['./drizzle/**/*'] },
  // Never ship data. lib/db/backup.ts and the storage layer resolve these
  // folders at runtime, so the file tracer copies whatever is in them
  // (real pg_dump files, users' uploads) into .next/standalone
  outputFileTracingExcludes: { '/*': ['../../backups/**/*', './uploads/**/*'] },
  serverExternalPackages: [
    '@electric-sql/pglite',
    '@electric-sql/pglite-pgvector',
    'postgres',
    'bullmq',
    'ioredis',
    'pdf-parse',
    '@mastra/core',
  ],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
