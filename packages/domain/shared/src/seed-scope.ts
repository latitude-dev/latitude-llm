import { createHash } from "node:crypto"
import { CUID_LENGTH } from "./id.ts"

/**
 * Per-project seeding context.
 *
 * The bootstrap seed scripts (`pnpm seed`) and the runtime "Create Demo
 * Project" workflow share the same seed bodies. Each entity id the seeders
 * write — datasets, evaluations, issues, queues, simulations, scores,
 * trace/span hex pairs — is resolved through a `SeedScope`. The bootstrap
 * caller threads a scope whose `cuid` / `traceHex` / etc. lookups return
 * the canonical literal values defined in `seeds.ts`, so `pnpm seed`
 * produces a byte-identical database. The demo caller threads a scope
 * with no overrides, so every method falls through to a deterministic
 * project-scoped derivation — fresh ids that don't collide with the
 * canonical seed project's rows.
 *
 * Shape rationale:
 * - `cuid` / `uuid` for entity ids; both 24-char-hex (CUID-shaped) and
 *   UUID-v4 strings appear in the underlying tables.
 * - `traceHex` / `spanHex` for ClickHouse spans — 32-char and 16-char hex
 *   respectively, already the format the existing `fixedTraceHex` /
 *   `fixedSpanHex` helpers in `seeds.ts` produce.
 * - `queueAssigneeUserIds` is non-empty by construction (the use-case
 *   that builds a demo scope already validated the org has members).
 *   Bootstrap scope passes the seven-user `SEED_MANUAL_QUEUE_ASSIGNEES`.
 * - `timelineAnchor` is the "now" all relative dates are computed from.
 *   Bootstrap passes `SEED_TIMELINE_ANCHOR`; demo passes a fresh
 *   per-call anchor.
 */
export interface SeedScope {
  readonly organizationId: string
  readonly projectId: string
  readonly timelineAnchor: Date
  readonly queueAssigneeUserIds: readonly string[]

  /** 24-char CUID-shaped id, stable per `(projectId, key)`. */
  cuid(key: string): string
  /** UUID-v4-shaped string, stable per `(projectId, key)`. */
  uuid(key: string): string
  /** 32-char hex trace id. `index` defaults to `0` for one-off keys. */
  traceHex(key: string, index?: number): string
  /** 16-char hex span id. */
  spanHex(key: string, index?: number): string
}

/**
 * Optional lookup overrides. Returning `undefined` from any of these falls
 * through to the deterministic derivation. Bootstrap scope wires lookups
 * that map fixture keys back to the canonical literals; demo scope omits
 * overrides entirely.
 */
export interface SeedScopeOverrides {
  cuid?: (key: string) => string | undefined
  uuid?: (key: string) => string | undefined
  traceHex?: (key: string, index: number) => string | undefined
  spanHex?: (key: string, index: number) => string | undefined
}

export interface CreateSeedScopeInput {
  readonly organizationId: string
  readonly projectId: string
  readonly timelineAnchor: Date
  readonly queueAssigneeUserIds: readonly string[]
  readonly overrides?: SeedScopeOverrides
}

const FIELD_SEPARATOR = "\x00"

const sha256 = (parts: readonly (string | number)[]): Buffer =>
  createHash("sha256").update(parts.map(String).join(FIELD_SEPARATOR)).digest()

const deriveCuid = (projectId: string, key: string): string =>
  sha256(["cuid", projectId, key]).toString("hex").slice(0, CUID_LENGTH)

const deriveUuid = (projectId: string, key: string): string => {
  // Layout-compliant v4: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` where `y` ∈
  // {8,9,a,b}. We don't strictly need RFC compliance for seed fixtures, but
  // matching the v4 shape avoids tripping consumers that validate UUIDs.
  const hex = sha256(["uuid", projectId, key]).toString("hex")
  const variantNibble = (Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variantNibble.toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-")
}

const TRACE_HEX_LENGTH = 32
const SPAN_HEX_LENGTH = 16

const deriveTraceHex = (projectId: string, key: string, index: number): string =>
  sha256(["trace", projectId, key, index]).toString("hex").slice(0, TRACE_HEX_LENGTH)

const deriveSpanHex = (projectId: string, key: string, index: number): string =>
  sha256(["span", projectId, key, index]).toString("hex").slice(0, SPAN_HEX_LENGTH)

/**
 * Build a `SeedScope`. Pass `overrides` for the bootstrap caller — keys not
 * found in the override functions still fall through to deterministic
 * derivation, which is the right behaviour for new fixtures the bootstrap
 * map hasn't been updated for yet (deterministic + project-scoped means
 * no collisions, just an id that differs from any pre-existing literal).
 */
export const createSeedScope = (input: CreateSeedScopeInput): SeedScope => {
  const { organizationId, projectId, timelineAnchor, queueAssigneeUserIds, overrides } = input
  return {
    organizationId,
    projectId,
    timelineAnchor,
    queueAssigneeUserIds,
    cuid: (key) => overrides?.cuid?.(key) ?? deriveCuid(projectId, key),
    uuid: (key) => overrides?.uuid?.(key) ?? deriveUuid(projectId, key),
    traceHex: (key, index = 0) => overrides?.traceHex?.(key, index) ?? deriveTraceHex(projectId, key, index),
    spanHex: (key, index = 0) => overrides?.spanHex?.(key, index) ?? deriveSpanHex(projectId, key, index),
  }
}
