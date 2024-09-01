const INTERNAL_PACKAGES = [
  '@latitude-data/web-ui',
  '@latitude-data/env',
  '@latitude-data/core',
  '@latitude-data/jobs',
  '@latitude-data/mailers',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: INTERNAL_PACKAGES,
  experimental: {
    // Dear developer,
    //
    // Unfortunately, our jobs packages uses some meta programming that relies
    // on the name of job handler functions for things to work properly. As you
    // can imagine, minification would break this. So we have to disable it.
    serverMinification: false,
  },
}

export default nextConfig
