const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface FakeClickhouseClientOptions {
  readonly healthy?: boolean;
  readonly latencyMs?: number;
  readonly errorMessage?: string;
}

export interface FakeClickhouseClient {
  ping: () => Promise<void>;
  close: () => Promise<void>;
  setHealthy: (healthy: boolean) => void;
}

export const createFakeClickhouseClient = (options: FakeClickhouseClientOptions = {}): FakeClickhouseClient => {
  let healthy = options.healthy ?? true;
  const latencyMs = options.latencyMs ?? 0;
  const errorMessage = options.errorMessage ?? "Fake ClickHouse is unhealthy";

  return {
    ping: async () => {
      if (latencyMs > 0) {
        await sleep(latencyMs);
      }

      if (!healthy) {
        throw new Error(errorMessage);
      }
    },
    close: async () => undefined,
    setHealthy: (nextHealthy: boolean) => {
      healthy = nextHealthy;
    },
  };
};
