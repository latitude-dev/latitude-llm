/**
 * An end-user identity attached to seeded telemetry (`user.id` / `user.email`
 * span attributes). `weight` skews random assignment so the users dashboard
 * shows a realistic mix of power users and long-tail users. An empty `email`
 * simulates integrations that only report an id.
 */
export type SeedUser = {
  readonly id: string
  readonly email: string
  readonly weight: number
}

/** Customer identities for customer-facing agents (Support Agent). */
export const CUSTOMER_USERS: readonly SeedUser[] = [
  { id: "usr-wile-e-coyote", email: "wile.e.coyote@gmail.com", weight: 30 },
  { id: "usr-yosemite-sam", email: "yosemite.sam@yahoo.com", weight: 18 },
  { id: "usr-daffy-duck", email: "daffy.d@gmail.com", weight: 14 },
  { id: "usr-elmer-fudd", email: "elmer.fudd@hotmail.com", weight: 10 },
  { id: "usr-taz", email: "taz@mail.com", weight: 8 },
  { id: "usr-sylvester", email: "sylvester.cat@outlook.com", weight: 6 },
  { id: "usr-marvin", email: "marvin@mars-colony.io", weight: 5 },
  { id: "usr-tweety", email: "tweety_b@birdmail.net", weight: 4 },
  { id: "usr-bugs-bunny", email: "", weight: 3 },
  { id: "usr-porky-pig", email: "", weight: 2 },
]

/** Employee identities for internal agents (Knowledge Assistant, Copywriter). */
export const EMPLOYEE_USERS: readonly SeedUser[] = [
  { id: "emp-foghorn", email: "foghorn.l@acme.com", weight: 4 },
  { id: "emp-pepe", email: "pepe.lp@acme.com", weight: 3 },
  { id: "emp-granny", email: "granny@acme.com", weight: 2 },
  { id: "emp-speedy", email: "speedy.g@acme.com", weight: 1 },
]

// Prime stride so consecutive indexes interleave users across the whole
// cumulative-weight range instead of chunking each user's share together.
// Degrades (still deterministic, but unevenly distributed) if a pool's total
// weight ever becomes a multiple of it.
const SEED_USER_STRIDE = 37

/**
 * Deterministic weighted pick for fixed seeds: index `i` always maps to the
 * same user, with each user's share of indexes proportional to its `weight`,
 * so re-seeds keep accumulating data on stable profiles. Use `pickSeedUser`
 * style random rolls only for ambient (non-idempotent) generation.
 */
export function seedUserAt(pool: readonly SeedUser[], index: number): SeedUser | undefined {
  const totalWeight = pool.reduce((sum, user) => sum + user.weight, 0)
  if (totalWeight <= 0) return undefined
  let position = (index * SEED_USER_STRIDE) % totalWeight
  for (const user of pool) {
    position -= user.weight
    if (position < 0) return user
  }
  return pool[pool.length - 1]
}

/** Metadata value pools */
export const SDK_VERSIONS = ["1.2.0", "1.3.1", "2.0.0-beta"] as const
export const REGIONS = ["us-desert-southwest", "us-mountain-west", "mars-colony-1", "eu-west-1"] as const
export const PRODUCT_CATEGORIES = [
  "explosives",
  "propulsion",
  "traps",
  "disguises",
  "construction",
  "miscellaneous",
] as const
export const CUSTOMER_TIERS = ["super-genius", "standard", "premium", "employee"] as const
export const CHANNELS = ["web", "mobile", "api", "smoke-signal"] as const
