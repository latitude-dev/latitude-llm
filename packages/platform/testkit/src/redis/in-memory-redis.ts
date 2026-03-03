type PipelineExecResult = [Error | null, number];

export interface InMemoryRedisPipeline {
  incr: (key: string) => InMemoryRedisPipeline;
  ttl: (key: string) => InMemoryRedisPipeline;
  exec: () => Promise<PipelineExecResult[]>;
}

export interface InMemoryRedisClient {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, seconds: number, value: string) => Promise<"OK">;
  del: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  pipeline: () => InMemoryRedisPipeline;
  select: (database: number) => Promise<"OK">;
  flushdb: () => Promise<"OK">;
  quit: () => Promise<"OK">;
}

interface InMemoryRedisState {
  readonly values: Map<string, string>;
  readonly expirations: Map<string, number>;
}

const createState = (): InMemoryRedisState => ({
  values: new Map(),
  expirations: new Map(),
});

const nowMs = () => Date.now();

const cleanupExpired = (state: InMemoryRedisState, key: string) => {
  const expiresAt = state.expirations.get(key);
  if (expiresAt === undefined) {
    return;
  }

  if (expiresAt <= nowMs()) {
    state.expirations.delete(key);
    state.values.delete(key);
  }
};

const computeTtlSeconds = (state: InMemoryRedisState, key: string): number => {
  cleanupExpired(state, key);

  if (!state.values.has(key)) {
    return -2;
  }

  const expiresAt = state.expirations.get(key);
  if (expiresAt === undefined) {
    return -1;
  }

  return Math.max(Math.ceil((expiresAt - nowMs()) / 1000), 0);
};

export const createInMemoryRedis = (): InMemoryRedisClient => {
  const state = createState();

  const increment = (key: string): number => {
    cleanupExpired(state, key);

    const currentRaw = state.values.get(key);
    const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
    const safeCurrent = Number.isNaN(current) ? 0 : current;
    const next = safeCurrent + 1;

    state.values.set(key, String(next));

    return next;
  };

  const pipeline = (): InMemoryRedisPipeline => {
    const commands: Array<() => number> = [];
    const pipelineApi: InMemoryRedisPipeline = {
      incr: (key: string) => {
        commands.push(() => increment(key));
        return pipelineApi;
      },
      ttl: (key: string) => {
        commands.push(() => computeTtlSeconds(state, key));
        return pipelineApi;
      },
      exec: async () => {
        const results: PipelineExecResult[] = [];

        for (const command of commands) {
          try {
            results.push([null, command()]);
          } catch (error) {
            results.push([error as Error, 0]);
          }
        }

        return results;
      },
    };

    return pipelineApi;
  };

  const client: InMemoryRedisClient = {
    get: async (key: string) => {
      cleanupExpired(state, key);
      return state.values.get(key) ?? null;
    },
    setex: async (key: string, seconds: number, value: string) => {
      state.values.set(key, value);
      state.expirations.set(key, nowMs() + seconds * 1000);
      return "OK";
    },
    del: async (key: string) => {
      cleanupExpired(state, key);
      const existed = state.values.delete(key);
      state.expirations.delete(key);
      return existed ? 1 : 0;
    },
    expire: async (key: string, seconds: number) => {
      cleanupExpired(state, key);
      if (!state.values.has(key)) {
        return 0;
      }

      state.expirations.set(key, nowMs() + seconds * 1000);
      return 1;
    },
    pipeline,
    select: async (_database: number) => "OK",
    flushdb: async () => {
      state.values.clear();
      state.expirations.clear();
      return "OK";
    },
    quit: async () => "OK",
  };

  return client;
};
