import { withSentryConfig } from '@sentry/nextjs'

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
  eslint: {
    // Fine because we do the linter pass in CI before building
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Fine because we do the TS pass in CI before building
    ignoreBuildErrors: true,
  },
  experimental: {
    // TODO: Review this decision. It would be more performant to use
    // direct uploads.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  images: {
    remotePatterns: [new URL('https://assets.pipedream.net/**')],
  },
}

let config
if (process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
  config = withSentryConfig(nextConfig, {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',

    // Hides source maps from generated client bundles
    hideSourceMaps: false,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: false,
  })
} else {
  config = nextConfig
}

export default config
