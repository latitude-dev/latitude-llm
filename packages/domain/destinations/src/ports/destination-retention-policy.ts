import type { OrganizationId } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * How far back an org's spans still exist — its subscription retention window in
 * ms. Backfill clamps its reach to this: past it, spans are already TTL-deleted
 * from ClickHouse (`start_time + retention_days + 30` DELETE), so reaching
 * further only yields empty windows. The engine depends on this port, not on
 * billing — the adapter (composition root) resolves the org's effective plan.
 * Self-contained: the implementation provides its own dependencies, so resolving
 * retention never leaks billing/cache requirements into the engine. Always
 * succeeds — the adapter falls back to the widest plan retention if billing is
 * momentarily unresolvable (over-reaching just reads empty windows; under-
 * reaching would silently drop exportable data).
 */
export interface DestinationRetentionPolicyShape {
  maxAgeMs(organizationId: OrganizationId): Effect.Effect<number>
}

export class DestinationRetentionPolicy extends Context.Service<
  DestinationRetentionPolicy,
  DestinationRetentionPolicyShape
>()("@domain/destinations/DestinationRetentionPolicy") {}
