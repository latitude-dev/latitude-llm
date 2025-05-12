const GATEWAY_HOST = process.env.GATEWAY_HOST
const GATEWAY_PORT = process.env.GATEWAY_PORT

export function getLocalGateway() {
  if (!GATEWAY_HOST || !GATEWAY_PORT) return null

  return {
    host: GATEWAY_HOST,
    port: parseInt(GATEWAY_PORT),
    ssl: false,
  }
}
