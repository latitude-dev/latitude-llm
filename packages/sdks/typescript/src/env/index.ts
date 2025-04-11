function generateEnv() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    GATEWAY_HOSTNAME: isProd ? 'gateway.latitude.so' : 'localhost',
    GATEWAY_PORT: !isProd ? 8787 : undefined,
    GATEWAY_SSL: isProd ? true : false,
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
