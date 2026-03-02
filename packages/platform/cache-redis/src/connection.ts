import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv } from "@platform/env";
import { Effect } from "effect";

export interface RedisConnection {
  readonly host: string;
  readonly port: number;
}

type CreateRedisConnectionError = MissingEnvValueError | InvalidEnvValueError;

export const createRedisConnectionEffect = (
  host?: string,
  port?: number,
): Effect.Effect<RedisConnection, CreateRedisConnectionError> => {
  const hostEffect = host ? Effect.succeed(host) : parseEnv(process.env.REDIS_HOST, "string");
  const portEffect = port ? Effect.succeed(port) : parseEnv(process.env.REDIS_PORT, "number");

  return Effect.all([hostEffect, portEffect]).pipe(
    Effect.map(([hostValue, portValue]) => ({
      host: hostValue,
      port: portValue,
    })),
  );
};

export const createRedisConnection = (host?: string, port?: number): RedisConnection => {
  return Effect.runSync(createRedisConnectionEffect(host, port));
};
