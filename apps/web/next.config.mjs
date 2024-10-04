import { withSentryConfig } from '@sentry/nextjs'

const INTERNAL_PACKAGES = [
  '@latitude-data/web-ui',
  '@latitude-data/env',
  '@latitude-data/core',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: INTERNAL_PACKAGES,
  serverExternalPackages: ['bullmq', 'jose'],
  experimental: {
    // Dear developer,
    //
    // Unfortunately, our jobs packages uses some meta programming that relies
    // on the name of job handler functions for things to work properly. As you
    // can imagine, minification would break this. So we have to disable it.
    serverMinification: false,
    // TODO: Review this decision. It would be more performant to use
    // direct uploads. To implement it we need to generate a signed URL
    // that's send directly to S3 and the clint upload the file to Amazon directly
    // What I stopped me from implementing is that dev experience would (maybe) be
    // different because in local environment we would need to upload the file to
    // the nextjs server as we do now.
    serverActions: {
      bodySizeLimit: '15mb',
    },
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
    hideSourceMaps: true,

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
