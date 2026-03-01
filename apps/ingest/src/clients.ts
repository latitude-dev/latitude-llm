import type { ClickHouseClient } from "@clickhouse/client";
import { createClickhouseClient } from "@platform/db-clickhouse";
import { createPostgresPool } from "@platform/db-postgres";

let postgresPoolInstance: ReturnType<typeof createPostgresPool> | undefined;
let clickhouseInstance: ClickHouseClient | undefined;

export const getPostgresPool = (): ReturnType<typeof createPostgresPool> => {
  if (!postgresPoolInstance) {
    postgresPoolInstance = createPostgresPool();
  }
  return postgresPoolInstance;
};

export const getClickhouseClient = (): ClickHouseClient => {
  if (!clickhouseInstance) {
    clickhouseInstance = createClickhouseClient();
  }
  return clickhouseInstance;
};
