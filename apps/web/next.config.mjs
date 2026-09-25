const INTERNAL_PACKAGES = [
  '@latitude-data/web-ui',
  '@latitude-data/env',
  '@latitude-data/core',
  '@latitude-data/constants',
]

const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ')

const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: INTERNAL_PACKAGES,
  serverExternalPackages: [
    '@latitude-data/sdk',
    '@latitude-data/telemetry',
    '@napi-rs/canvas',
    'bullmq',
    'dd-trace',
    'openid-client',
    'pdfjs-dist',
    'promptl-ai',
  ],
  typescript: {
    // Fine because we do the TS pass in CI before building
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
    preloadEntriesOnStart: false,
  },
  images: {
    remotePatterns: [new URL('https://assets.pipedream.net/**')],
  },
  // Serve static assets from S3 for persistent chunk availability
  assetPrefix: process.env.NEXT_PUBLIC_STATIC_ASSETS_URL,
  // Enable source maps for Datadog error tracking
  productionBrowserSourceMaps: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
