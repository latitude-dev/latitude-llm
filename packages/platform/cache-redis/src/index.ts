import { ServiceMap } from "effect";

export class RedisCacheAdapterTag extends ServiceMap.Service<
  RedisCacheAdapterTag,
  {
    readonly type: "redis";
  }
>()("RedisCacheAdapterTag") {}

export const redisCacheAdapter = {
  type: "redis" as const,
};

export type { RedisConnection } from "./connection.js";
export {
  createRedisConnection,
  createRedisConnectionEffect,
} from "./connection.js";

export type { RedisClient } from "./client.js";
export { createRedisClient } from "./client.js";
