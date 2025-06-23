function generateEnv() {
  const isProd = process.env.NODE_ENV === 'production'
  const defaultHostname = isProd ? 'gateway.latitude.so' : 'localhost'
  const defaultPort = !isProd ? 8787 : undefined
  const defaultSsl = isProd ? true : false

  return {
    GATEWAY_HOSTNAME: process.env.GATEWAY_HOSTNAME ?? defaultHostname,
    GATEWAY_PORT: Number(process.env.GATEWAY_PORT ?? defaultPort),
    GATEWAY_SSL: Boolean(process.env.GATEWAY_SSL ?? defaultSsl),
  }
}

type SdkEnv = {
  GATEWAY_HOSTNAME: string
  GATEWAY_SSL: boolean
  GATEWAY_PORT?: number
}

let sdkEnv: SdkEnv

function createEnv() {
  if (sdkEnv) return sdkEnv

  sdkEnv = generateEnv()
  return sdkEnv
}

export default createEnv()
