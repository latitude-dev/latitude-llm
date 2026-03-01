import type { ClickHouseClient } from "@clickhouse/client";
import { createClickhouseClient } from "@platform/db-clickhouse";
import { createPostgresPool } from "@platform/db-postgres";
import type { Pool } from "pg";

let postgresPoolInstance: Pool | undefined;
let clickhouseInstance: ClickHouseClient | undefined;

export const getPostgresPool = (): Pool => {
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
