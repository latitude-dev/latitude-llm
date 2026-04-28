import { createSeedScope, type SeedScope } from "./seed-scope.ts"
import {
  SEED_ACCESS_EVALUATION_ID,
  SEED_ACCESS_ISSUE_ID,
  SEED_ACCESS_ISSUE_UUID,
  SEED_ANNOTATION_DEMO_SPAN_ID,
  SEED_ANNOTATION_DEMO_TRACE_ID,
  SEED_ANNOTATION_QUEUE_COMBINATION_ID,
  SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_COMPLETED_A_ID,
  SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_COMPLETED_B_ID,
  SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_PENDING_ID,
  SEED_ANNOTATION_QUEUE_ITEM_KITCHEN_SINK_ID,
  SEED_ANNOTATION_QUEUE_ITEM_LIVE_PENDING_ID,
  SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_COMPLETED_A_ID,
  SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_COMPLETED_B_ID,
  SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_PENDING_ID,
  SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_PENDING_ID,
  SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_COMPLETED_A_ID,
  SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_COMPLETED_B_ID,
  SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_PENDING_ID,
  SEED_ANNOTATION_QUEUE_KITCHEN_SINK_ID,
  SEED_ANNOTATION_QUEUE_LIVE_ID,
  SEED_ANNOTATION_QUEUE_LOGISTICS_ID,
  SEED_ANNOTATION_QUEUE_SYSTEM_ID,
  SEED_ANNOTATION_QUEUE_WARRANTY_ID,
  SEED_BILLING_ISSUE_ID,
  SEED_BILLING_ISSUE_UUID,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_COMBINATION_ISSUE_ID,
  SEED_COMBINATION_ISSUE_UUID,
  SEED_DATASET_ID,
  SEED_DATASET_VERSION_ID,
  SEED_EVALUATION_ARCHIVED_ID,
  SEED_EVALUATION_ID,
  SEED_EXTRA_ISSUE_IDS,
  SEED_EXTRA_ISSUE_UUIDS,
  SEED_FLAGGER_ISSUE_ID,
  SEED_FLAGGER_ISSUE_UUID,
  SEED_GENERATE_ISSUE_ID,
  SEED_GENERATE_ISSUE_UUID,
  SEED_INSTALLATION_ISSUE_ID,
  SEED_INSTALLATION_ISSUE_UUID,
  SEED_ISSUE_ID,
  SEED_ISSUE_UUID,
  SEED_LIFECYCLE_SPAN_IDS,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_MANUAL_QUEUE_ASSIGNEES,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_RETURNS_EVALUATION_ID,
  SEED_RETURNS_ISSUE_ID,
  SEED_RETURNS_ISSUE_UUID,
  SEED_SCORE_API_REVIEWED_ID,
  SEED_SCORE_COMBINATION_SIMULATION_ID,
  SEED_SCORE_DRAFT_ID,
  SEED_SCORE_ERRORED_ID,
  SEED_SCORE_PASSED_ID,
  SEED_SCORE_PENDING_ID,
  SEED_SCORE_WARRANTY_SIMULATION_ACTIVE_ID,
  SEED_SCORE_WARRANTY_SIMULATION_ARCHIVED_ID,
  SEED_SIMULATION_ERRORED_ID,
  SEED_SIMULATION_ID,
  SEED_TIMELINE_ANCHOR,
  SEED_UI_POLISH_SCORE_IDS,
  SEED_WARRANTY_DATASET_ID,
  SEED_WARRANTY_DATASET_VERSION_ID,
  SEED_WARRANTY_SIMULATION_ID,
} from "./seeds.ts"

/**
 * Bootstrap-scope key→literal lookup map.
 *
 * The canonical seed project's literal ids defined in `seeds.ts` are
 * mapped here under stable fixture keys. Seeders look up ids via
 * `ctx.scope.cuid("dataset:warranty")` etc.; the bootstrap scope's
 * override returns the literal value below, while the demo scope falls
 * through to a deterministic derivation.
 *
 * Every key that the seed bodies actively look up must have an entry —
 * otherwise the bootstrap scope produces a fresh derived id that
 * differs from the canonical literal, and `pnpm seed` regresses.
 */
const BOOTSTRAP_CUID_OVERRIDES: Readonly<Record<string, string>> = {
  // Datasets
  "dataset:warranty": SEED_WARRANTY_DATASET_ID,
  "dataset:warranty:version": SEED_WARRANTY_DATASET_VERSION_ID,
  "dataset:combination": SEED_DATASET_ID,
  "dataset:combination:version": SEED_DATASET_VERSION_ID,

  // Named issues (8)
  "issue:warranty-fab": SEED_ISSUE_ID,
  "issue:combination": SEED_COMBINATION_ISSUE_ID,
  "issue:logistics": SEED_GENERATE_ISSUE_ID,
  "issue:returns": SEED_RETURNS_ISSUE_ID,
  "issue:billing": SEED_BILLING_ISSUE_ID,
  "issue:access": SEED_ACCESS_ISSUE_ID,
  "issue:installation": SEED_INSTALLATION_ISSUE_ID,
  "issue:flagger": SEED_FLAGGER_ISSUE_ID,

  // Long-tail issues (128) — populated below in the spread
  ...Object.fromEntries(SEED_EXTRA_ISSUE_IDS.map((id, i) => [`issue:extra:${i}`, id])),

  // Evaluations
  "evaluation:warranty-active": SEED_EVALUATION_ID,
  "evaluation:warranty-archived": SEED_EVALUATION_ARCHIVED_ID,
  "evaluation:combination": SEED_COMBINATION_EVALUATION_ID,
  "evaluation:returns": SEED_RETURNS_EVALUATION_ID,
  "evaluation:access": SEED_ACCESS_EVALUATION_ID,

  // Annotation queues
  "queue:warranty": SEED_ANNOTATION_QUEUE_WARRANTY_ID,
  "queue:combination": SEED_ANNOTATION_QUEUE_COMBINATION_ID,
  "queue:logistics": SEED_ANNOTATION_QUEUE_LOGISTICS_ID,
  "queue:system": SEED_ANNOTATION_QUEUE_SYSTEM_ID,
  "queue:live": SEED_ANNOTATION_QUEUE_LIVE_ID,
  "queue:kitchen-sink": SEED_ANNOTATION_QUEUE_KITCHEN_SINK_ID,

  // Queue items (11)
  "queue-item:warranty:pending": SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_PENDING_ID,
  "queue-item:warranty:completed-a": SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_COMPLETED_A_ID,
  "queue-item:warranty:completed-b": SEED_ANNOTATION_QUEUE_ITEM_WARRANTY_COMPLETED_B_ID,
  "queue-item:combination:pending": SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_PENDING_ID,
  "queue-item:combination:completed-a": SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_COMPLETED_A_ID,
  "queue-item:combination:completed-b": SEED_ANNOTATION_QUEUE_ITEM_COMBINATION_COMPLETED_B_ID,
  "queue-item:logistics:pending": SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_PENDING_ID,
  "queue-item:logistics:completed-a": SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_COMPLETED_A_ID,
  "queue-item:logistics:completed-b": SEED_ANNOTATION_QUEUE_ITEM_LOGISTICS_COMPLETED_B_ID,
  "queue-item:system:pending": SEED_ANNOTATION_QUEUE_ITEM_SYSTEM_PENDING_ID,
  "queue-item:live:pending": SEED_ANNOTATION_QUEUE_ITEM_LIVE_PENDING_ID,
  "queue-item:kitchen-sink": SEED_ANNOTATION_QUEUE_ITEM_KITCHEN_SINK_ID,

  // Simulations
  "simulation:warranty": SEED_WARRANTY_SIMULATION_ID,
  "simulation:combination": SEED_SIMULATION_ID,
  "simulation:errored": SEED_SIMULATION_ERRORED_ID,

  // Scores
  "score:passed": SEED_SCORE_PASSED_ID,
  "score:errored": SEED_SCORE_ERRORED_ID,
  "score:draft": SEED_SCORE_DRAFT_ID,
  "score:pending": SEED_SCORE_PENDING_ID,
  "score:api-reviewed": SEED_SCORE_API_REVIEWED_ID,
  "score:warranty-simulation-active": SEED_SCORE_WARRANTY_SIMULATION_ACTIVE_ID,
  "score:warranty-simulation-archived": SEED_SCORE_WARRANTY_SIMULATION_ARCHIVED_ID,
  "score:combination-simulation": SEED_SCORE_COMBINATION_SIMULATION_ID,

  // UI-polish demo annotation scores (12)
  "score:ui-polish:human-draft-1": SEED_UI_POLISH_SCORE_IDS.humanDraft1,
  "score:ui-polish:human-draft-2": SEED_UI_POLISH_SCORE_IDS.humanDraft2,
  "score:ui-polish:human-draft-3": SEED_UI_POLISH_SCORE_IDS.humanDraft3,
  "score:ui-polish:human-published-1": SEED_UI_POLISH_SCORE_IDS.humanPublished1,
  "score:ui-polish:human-published-2": SEED_UI_POLISH_SCORE_IDS.humanPublished2,
  "score:ui-polish:human-published-3": SEED_UI_POLISH_SCORE_IDS.humanPublished3,
  "score:ui-polish:agent-draft-1": SEED_UI_POLISH_SCORE_IDS.agentDraft1,
  "score:ui-polish:agent-draft-2": SEED_UI_POLISH_SCORE_IDS.agentDraft2,
  "score:ui-polish:agent-draft-3": SEED_UI_POLISH_SCORE_IDS.agentDraft3,
  "score:ui-polish:agent-published-1": SEED_UI_POLISH_SCORE_IDS.agentPublished1,
  "score:ui-polish:agent-published-2": SEED_UI_POLISH_SCORE_IDS.agentPublished2,
  "score:ui-polish:api-published-1": SEED_UI_POLISH_SCORE_IDS.apiPublished1,
}

const BOOTSTRAP_UUID_OVERRIDES: Readonly<Record<string, string>> = {
  "issue:warranty-fab:uuid": SEED_ISSUE_UUID,
  "issue:combination:uuid": SEED_COMBINATION_ISSUE_UUID,
  "issue:logistics:uuid": SEED_GENERATE_ISSUE_UUID,
  "issue:returns:uuid": SEED_RETURNS_ISSUE_UUID,
  "issue:billing:uuid": SEED_BILLING_ISSUE_UUID,
  "issue:access:uuid": SEED_ACCESS_ISSUE_UUID,
  "issue:installation:uuid": SEED_INSTALLATION_ISSUE_UUID,
  "issue:flagger:uuid": SEED_FLAGGER_ISSUE_UUID,

  ...Object.fromEntries(SEED_EXTRA_ISSUE_UUIDS.map((uuid, i) => [`issue:extra:${i}:uuid`, uuid])),
}

/**
 * Trace/span hex prefixes used by the existing `fixedTraceHex` /
 * `fixedSpanHex` helpers in `seeds.ts`. Bootstrap scope's `traceHex(key, i)`
 * delegates here: the canonical hex shape stays identical to what
 * `SEED_*_TRACE_IDS[i]` currently produces. Demo scope ignores this and
 * derives a fresh project-scoped hex.
 */
const TRACE_PREFIX_BY_KEY: Readonly<Record<string, string>> = {
  annotation: "af",
  "alignment-fixture": "bf",
  "json-response": "1f",
  "warranty-simulation": "cf",
  "combination-simulation": "df",
  "issue-occurrence": "ef",
}

const ALIGNMENT_INDEX_OFFSET = 100

const renderTraceHex = (prefix: string, index: number): string =>
  `${prefix}${index.toString(16).padStart(6, "0")}${"0".repeat(24)}`

const renderSpanHex = (prefix: string, index: number): string =>
  `${prefix}${index.toString(16).padStart(6, "0")}${"0".repeat(8)}`

/**
 * Look up an existing literal trace hex for `(key, index)`. Each fixture
 * key maps to a distinct prefix; some arrays use an offset (alignment
 * fixtures start at index 100). The lifecycle/demo trace ids are direct
 * literals, handled below in {@link bootstrapTraceHex}.
 */
const bootstrapTraceHex = (key: string, index: number): string | undefined => {
  if (key === "lifecycle") return SEED_LIFECYCLE_TRACE_IDS[index]
  if (key === "annotation-demo") return SEED_ANNOTATION_DEMO_TRACE_ID
  const prefix = TRACE_PREFIX_BY_KEY[key]
  if (!prefix) return undefined
  const offset = key === "alignment-fixture" ? ALIGNMENT_INDEX_OFFSET : 0
  return renderTraceHex(prefix, offset + index)
}

const bootstrapSpanHex = (key: string, index: number): string | undefined => {
  if (key === "lifecycle") return SEED_LIFECYCLE_SPAN_IDS[index]
  if (key === "annotation-demo") return SEED_ANNOTATION_DEMO_SPAN_ID
  const prefix = TRACE_PREFIX_BY_KEY[key]
  if (!prefix) return undefined
  const offset = key === "alignment-fixture" ? ALIGNMENT_INDEX_OFFSET : 0
  return renderSpanHex(prefix, offset + index)
}

/**
 * The canonical bootstrap-project seed scope. Threaded through the dev
 * `pnpm seed` runner so every seeder body resolves entity ids via this
 * scope. The override functions return the existing literal values; new
 * keys (added when fixtures grow) fall through to deterministic
 * derivation, which is the safe default — fresh keys produce fresh ids
 * rather than colliding with anything already in `seeds.ts`.
 */
export const bootstrapSeedScope: SeedScope = createSeedScope({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  timelineAnchor: SEED_TIMELINE_ANCHOR,
  queueAssigneeUserIds: [...SEED_MANUAL_QUEUE_ASSIGNEES],
  overrides: {
    cuid: (key) => BOOTSTRAP_CUID_OVERRIDES[key],
    uuid: (key) => BOOTSTRAP_UUID_OVERRIDES[key],
    traceHex: bootstrapTraceHex,
    spanHex: bootstrapSpanHex,
  },
})
