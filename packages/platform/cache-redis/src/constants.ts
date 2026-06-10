/**
 * Global key prefix applied to every Redis key Latitude writes through the
 * shared cache client (cache entries, distributed locks, rate-limiter counters,
 * budget reservations, …) via the ioredis `keyPrefix` option. It lets Latitude
 * share a Redis instance with another app without key collisions.
 *
 * ioredis prepends this verbatim with no separator (and applies it to `eval`
 * KEYS too, by `numkeys`), so the trailing ":" is the namespace delimiter —
 * `org:123:…` becomes `latitude:org:123:…`. BullMQ derives its own prefix from
 * this constant (see `@platform/queue-bullmq`'s `BULLMQ_PREFIX`).
 */
export const REDIS_KEY_PREFIX = "latitude:"
