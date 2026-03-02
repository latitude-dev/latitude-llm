import {
  type ClickHouseClient,
  type ClickHouseClientConfigOptions,
  createClient,
} from "@clickhouse/client";
import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv } from "@platform/env";
import { Effect } from "effect";

export interface ClickhouseConfig {
  readonly url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly database?: string;
}

type CreateClickhouseClientError = MissingEnvValueError | InvalidEnvValueError;

export const createClickhouseClientEffect = (
  config: ClickhouseConfig = {},
): Effect.Effect<ClickHouseClient, CreateClickhouseClientError> => {
  return Effect.all({
    url: config.url ? Effect.succeed(config.url) : parseEnv(process.env.CLICKHOUSE_URL, "string"),
    username: config.username
      ? Effect.succeed(config.username)
      : parseEnv(process.env.CLICKHOUSE_USER, "string"),
    password: config.password
      ? Effect.succeed(config.password)
      : parseEnv(process.env.CLICKHOUSE_PASSWORD, "string"),
    database: config.database
      ? Effect.succeed(config.database)
      : parseEnv(process.env.CLICKHOUSE_DB, "string"),
  }).pipe(
    Effect.map((resolvedConfig) => {
      const options: ClickHouseClientConfigOptions = {
        url: resolvedConfig.url,
        username: resolvedConfig.username,
        password: resolvedConfig.password,
        database: resolvedConfig.database,
      };

      return createClient(options);
    }),
  );
};

export const createClickhouseClient = (config: ClickhouseConfig = {}): ClickHouseClient => {
  return Effect.runSync(createClickhouseClientEffect(config));
};

export const closeClickhouse = async (client: ClickHouseClient): Promise<void> => {
  await client.close();
};
