export type RedisPipelineResult = [Error | null, unknown];

export interface ApiRedisPipelineClient {
  incr: (key: string) => ApiRedisPipelineClient;
  ttl: (key: string) => ApiRedisPipelineClient;
  exec: () => Promise<RedisPipelineResult[] | null>;
}

export interface ApiRedisClient {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, seconds: number, value: string) => Promise<unknown>;
  del: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  pipeline: () => ApiRedisPipelineClient;
}
