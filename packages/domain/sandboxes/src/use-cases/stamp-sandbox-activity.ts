import { Effect } from "effect"
import { SANDBOX_ACTIVITY_STAMP_DEBOUNCE_MS } from "../constants.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"
import { SandboxSignals } from "../ports/sandbox-signals.ts"

/**
 * Stamp the sandbox's `last_activity_at` on ingest, debounced: a Redis `SET NX`
 * gate keeps the hot-path Postgres write rate to at most once per
 * {@link SANDBOX_ACTIVITY_STAMP_DEBOUNCE_MS}. A live org never reaches this.
 */
export const stampSandboxActivityUseCase = Effect.fn("sandboxes.stampActivity")(function* (input: {
  readonly organizationId: string
  readonly debounceMs?: number
}) {
  const signals = yield* SandboxSignals
  const acquired = yield* signals.tryAcquireActivityStamp({
    organizationId: input.organizationId,
    debounceMs: input.debounceMs ?? SANDBOX_ACTIVITY_STAMP_DEBOUNCE_MS,
  })

  if (!acquired) return

  const repo = yield* SandboxRepository
  yield* repo.stampActivity()
})
