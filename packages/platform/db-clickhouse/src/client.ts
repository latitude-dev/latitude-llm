import {
  type ClickHouseClient,
  type ClickHouseClientConfigOptions,
  createClient,
} from "@clickhouse/client";

export interface ClickhouseConfig {
  readonly url?: string;
  readonly username?: string;
  readonly password?: string;
  readonly database?: string;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`${name} must be declared`);
  }

  return value;
};

export const createClickhouseClient = (config: ClickhouseConfig = {}): ClickHouseClient => {
  const url = config.url ?? requireEnv("CLICKHOUSE_URL");
  const username = config.username ?? requireEnv("CLICKHOUSE_USER");
  const password = config.password ?? requireEnv("CLICKHOUSE_PASSWORD");
  const database = config.database ?? requireEnv("CLICKHOUSE_DB");

  const options: ClickHouseClientConfigOptions = {
    url,
    username,
    password,
    database,
  };

  return createClient(options);
};

export const closeClickhouse = async (client: ClickHouseClient): Promise<void> => {
  await client.close();
};
