const INTERNAL_PACKAGES = [
  '@latitude-data/web-ui',
  '@latitude-data/env',
  '@latitude-data/core',
  '@latitude-data/constants',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: INTERNAL_PACKAGES,
  serverExternalPackages: [
    '@latitude-data/sdk',
    '@napi-rs/canvas',
    'bullmq',
    'nodemailer-mailgun-transport',
    'openid-client',
    'pdfjs-dist',
    'promptl-ai',
  ],
  typescript: {
    // Fine because we do the TS pass in CI before building
    ignoreBuildErrors: true,
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  images: {
    remotePatterns: [new URL('https://assets.pipedream.net/**')],
  },
  // Serve static assets from S3 for persistent chunk availability
  assetPrefix: process.env.NEXT_PUBLIC_STATIC_ASSETS_URL,
}

export default nextConfig
