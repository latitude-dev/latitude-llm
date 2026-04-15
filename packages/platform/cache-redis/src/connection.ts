import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface RedisConnection {
  readonly host: string
  readonly port: number
  readonly password?: string
  readonly tls?: boolean
}

type CreateRedisConnectionError = MissingEnvValueError | InvalidEnvValueError

export const createRedisConnectionEffect = (
  host?: string,
  port?: number,
): Effect.Effect<RedisConnection, CreateRedisConnectionError> => {
  const hostEffect = host ? Effect.succeed(host) : parseEnv("LAT_REDIS_HOST", "string")
  const portEffect = port ? Effect.succeed(port) : parseEnv("LAT_REDIS_PORT", "number")
  const tlsEffect = parseEnvOptional("LAT_REDIS_TLS", "string")

  return Effect.all([hostEffect, portEffect, tlsEffect]).pipe(
    Effect.map(([hostValue, portValue, tlsValue]) => ({
      host: hostValue,
      port: portValue,
      ...(tlsValue === "true" ? { tls: true } : {}),
    })),
  )
}

export const createRedisConnection = (host?: string, port?: number): RedisConnection => {
  return Effect.runSync(createRedisConnectionEffect(host, port))
}
