const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface FakePostgresPoolOptions {
  readonly healthy?: boolean;
  readonly latencyMs?: number;
  readonly errorMessage?: string;
}

export interface FakePostgresPool {
  query: (sql: string) => Promise<{ rows: [] }>;
  end: () => Promise<void>;
  setHealthy: (healthy: boolean) => void;
}

export const createFakePostgresPool = (options: FakePostgresPoolOptions = {}): FakePostgresPool => {
  let healthy = options.healthy ?? true;
  const latencyMs = options.latencyMs ?? 0;
  const errorMessage = options.errorMessage ?? "Fake Postgres is unhealthy";

  return {
    query: async (_sql: string) => {
      if (latencyMs > 0) {
        await sleep(latencyMs);
      }

      if (!healthy) {
        throw new Error(errorMessage);
      }

      return { rows: [] };
    },
    end: async () => undefined,
    setHealthy: (nextHealthy: boolean) => {
      healthy = nextHealthy;
    },
  };
};
