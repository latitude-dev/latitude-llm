const DEFAULT_GATEWAY_BASE_URL =
  {
    production: 'https://gateway.latitude.so',
    development: 'http://localhost:8787',
    test: 'http://localhost:8787',
  }[process.env.NODE_ENV ?? 'development'] ?? 'http://localhost:8787'

function GET_GATEWAY_BASE_URL() {
  if (process.env.GATEWAY_BASE_URL) {
    return process.env.GATEWAY_BASE_URL
  }

  if (!process.env.GATEWAY_HOSTNAME) {
    return DEFAULT_GATEWAY_BASE_URL
  }

  const protocol = process.env.GATEWAY_SSL ? 'https' : 'http'
  const port = process.env.GATEWAY_PORT ?? (process.env.GATEWAY_SSL ? 443 : 80)
  const hostname = process.env.GATEWAY_HOSTNAME

  return `${protocol}://${hostname}:${port}`
}

export const env = { GATEWAY_BASE_URL: GET_GATEWAY_BASE_URL() } as const
