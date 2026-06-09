import { REDIS_KEY_PREFIX } from "@platform/cache-redis"

/**
 * BullMQ key prefix: the shared `REDIS_KEY_PREFIX` namespace (`latitude:`) plus a
 * `{bull}` Redis Cluster hash-tag. Two deliberate details:
 *
 *  - BullMQ inserts its own `:` after the prefix, so the prefix must NOT end in a
 *    colon. `REDIS_KEY_PREFIX` already supplies the one between `latitude` and
 *    `{bull}`, giving keys like `latitude:{bull}:<queue>:<type>` — no
 *    `latitude::…` double-colon (the bug the old single-prefix setup produced).
 *  - The `{…}` hash-tag pins every queue's keys to one Redis Cluster slot, which
 *    BullMQ requires on a clustered Redis (AWS MemoryDB/ElastiCache).
 */
export const BULLMQ_PREFIX = `${REDIS_KEY_PREFIX}{bull}`
