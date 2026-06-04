import { checkTraceIngestionBillingUseCase, resolveEffectivePlan } from "@domain/billing"
import {
  publishSandboxTraceSignalsUseCase,
  type Sandbox,
  SandboxArchivedError,
  SandboxQuotaExceededError,
  SandboxRepository,
  SandboxSignals,
  stampSandboxActivityUseCase,
} from "@domain/sandboxes"
import { Effect } from "effect"
import type { OtlpExportTraceServiceRequest } from "../otlp/types.ts"
import { decodeOtlpRequest, type IngestSpansInput, ingestSpansUseCase, inspectOtlpForSandbox } from "./ingest-spans.ts"

/**
 * Pre-enqueue guard for a sandbox ingest (never billed): the loud, pre-persist
 * refusals that mirror billing's 402 — archived (403 `SandboxArchived`) and
 * over-quota (403 `SandboxQuotaExceeded`), each leaving a "last rejected ingest"
 * marker for the sandbox UI — plus the debounced `last_activity_at` stamp and the
 * earliest realtime "liveness" pulse (before enqueue, skipping queue + worker
 * latency). Operates on the request decoded once by the caller. `sandbox` is `null`
 * only on the rare data-inconsistency where a sandbox org has no attributes row —
 * treated as active (no archived refusal). Fails before any span is enqueued.
 */
const guardSandboxIngestion = Effect.fn("spans.guardSandboxIngestion")(function* (
  input: IngestSpansInput,
  sandbox: Sandbox | null,
  decoded: OtlpExportTraceServiceRequest | null,
) {
  const signals = yield* SandboxSignals
  const inspection = inspectOtlpForSandbox(decoded)

  if (sandbox?.status === "archived") {
    yield* signals.recordRejectedIngest({
      organizationId: input.organizationId,
      marker: {
        kind: "SandboxArchived",
        at: new Date().toISOString(),
        spansDropped: inspection.totalSpans,
      },
    })
    return yield* Effect.fail(new SandboxArchivedError({ organizationId: input.organizationId }))
  }

  // Active sandbox receiving traffic — keep it awake (debounced) before the
  // volume guard, which is a separate concern from sleep.
  yield* stampSandboxActivityUseCase({
    organizationId: input.organizationId,
  })

  const plan = yield* resolveEffectivePlan(input.organizationId)
  if (inspection.totalSpans > 0) {
    const periodTotal = yield* signals.incrementSpanQuota({
      organizationId: input.organizationId,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      spanCount: inspection.totalSpans,
    })
    if (periodTotal > plan.plan.spanQuotaPerPeriod) {
      yield* signals.recordRejectedIngest({
        organizationId: input.organizationId,
        marker: {
          kind: "SandboxQuotaExceeded",
          at: new Date().toISOString(),
          spansDropped: inspection.totalSpans,
        },
      })
      return yield* Effect.fail(
        new SandboxQuotaExceededError({
          organizationId: input.organizationId,
        }),
      )
    }
  }

  yield* publishSandboxTraceSignalsUseCase({
    organizationId: input.organizationId,
    kind: "liveness",
    traces: inspection.traceSignals,
  })
})

export const ingestSpansWithBillingUseCase = Effect.fn("spans.ingestSpansWithBilling")(function* (
  input: IngestSpansInput,
) {
  const decoded = decodeOtlpRequest(input.payload, input.contentType)

  if (input.isSandbox) {
    const sandboxRepo = yield* SandboxRepository
    const sandbox = yield* sandboxRepo.findOptional()
    yield* guardSandboxIngestion(input, sandbox, decoded)
  } else {
    yield* checkTraceIngestionBillingUseCase(input.organizationId)
  }

  return yield* ingestSpansUseCase({ ...input, decoded })
})
