import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface RedisConnection {
  readonly host: string
  readonly port: number
  readonly password?: string
  readonly tls?: boolean
  readonly cluster?: boolean
}

type CreateRedisConnectionError = MissingEnvValueError | InvalidEnvValueError

export const createRedisConnectionEffect = (
  host?: string,
  port?: number,
): Effect.Effect<RedisConnection, CreateRedisConnectionError> => {
  const hostEffect = host ? Effect.succeed(host) : parseEnv("LAT_REDIS_HOST", "string")
  const portEffect = port ? Effect.succeed(port) : parseEnv("LAT_REDIS_PORT", "number")
  const tlsEffect = parseEnvOptional("LAT_REDIS_TLS", "string")
  const clusterEffect = parseEnvOptional("LAT_REDIS_CLUSTER", "boolean")

  return Effect.all([hostEffect, portEffect, tlsEffect, clusterEffect]).pipe(
    Effect.map(([hostValue, portValue, tlsValue, clusterValue]) => ({
      host: hostValue,
      port: portValue,
      ...(tlsValue === "true" ? { tls: true } : {}),
      ...(clusterValue === true ? { cluster: true } : {}),
    })),
  )
}

export const createRedisConnection = (host?: string, port?: number): RedisConnection => {
  return Effect.runSync(createRedisConnectionEffect(host, port))
}
