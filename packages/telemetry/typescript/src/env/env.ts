const DEFAULT_GATEWAY_BASE_URL =
  {
    production: 'https://gateway.latitude.so',
    development: 'http://localhost:8787',
    test: 'http://localhost:8787',
  }[process.env.NODE_ENV ?? 'development'] ?? 'http://localhost:8787'

export const env = {
  GATEWAY_BASE_URL: process.env.GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE_URL,
} as const
