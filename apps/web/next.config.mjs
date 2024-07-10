import path from 'path'
import { fileURLToPath } from 'url'

const currentFileURL = import.meta.url
const __filename = fileURLToPath(currentFileURL)
const __dirname = path.dirname(__filename)

const PACKAGES = ['env', 'core', 'jobs', 'web-ui']
const PACKAGE_NAMES = PACKAGES.map((pkg) => `@latitude-data/${pkg}`)
const INTERNAL_PACKAGES = Object.values(PACKAGE_NAMES)
const EXTERNAL_PACKAGES = [
  'zod',
  'drizzle-orm',
  'pg',
  'bullmq',
  'bcrypt',
  'ioredis',
]

function buildAlias({ localPackages }) {
  return localPackages.reduce((aliases, pkg) => {
    aliases[`$${pkg}`] = path.resolve(__dirname, `../../packages/${pkg}/src`)
    return aliases
  }, {})
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: INTERNAL_PACKAGES,
  experimental: {
    outputFileTracingRoot: path.join(__filename, '../../'),
  },
  images: {
    // This project does not uses images and I experienced some `MaxListenersExceededWarning` errors while
    // doing the Dockerfile production image. Related issue:
    // https://github.com/vercel/next.js/issues/54482
    // There for this flag to true does not hurt us atm
    unoptimized: true,
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...buildAlias({ localPackages: PACKAGES }),
    }

    config.externals = [...config.externals, ...EXTERNAL_PACKAGES]

    return config
  },
}

export default nextConfig
