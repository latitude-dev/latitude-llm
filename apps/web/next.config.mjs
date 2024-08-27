const INTERNAL_PACKAGES = [
  '@latitude-data/web-ui',
  '@latitude-data/env',
  '@latitude-data/core',
  '@latitude-data/jobs',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: INTERNAL_PACKAGES,
}

export default nextConfig
