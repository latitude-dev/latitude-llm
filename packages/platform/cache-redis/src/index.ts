import { Context } from "effect";

export class RedisCacheAdapterTag extends Context.Tag("RedisCacheAdapterTag")<
  RedisCacheAdapterTag,
  {
    readonly type: "redis";
  }
>() {}

export const redisCacheAdapter = {
  type: "redis" as const,
};

export type { RedisConnection } from "./connection.js";
export {
  createRedisConnection,
  createRedisConnectionEffect,
} from "./connection.js";
