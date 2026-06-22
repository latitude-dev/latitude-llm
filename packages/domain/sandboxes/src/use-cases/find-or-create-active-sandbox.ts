import { Effect } from "effect"
import { type FindOrCreateSandboxInput, findOrCreateSandboxUseCase } from "./find-or-create-sandbox.ts"
import { reactivateSandboxUseCase } from "./reactivate-sandbox.ts"

/**
 * The org's single sandbox, resolved for *entry*: find-or-create it, then wake
 * it if it was asleep, so flipping the live→sandbox toggle always lands in an
 * active sandbox. A freshly created sandbox is already active — only the
 * resolved-existing path may need waking, and reactivation is idempotent on an
 * already-active one. The "asleep" UI is then only reachable by navigating to
 * an archived sandbox directly. `createdNow` is forwarded so a caller can still
 * roll back a sandbox it just created if a follow-up step fails.
 */
export const findOrCreateActiveSandboxUseCase = Effect.fn("sandboxes.findOrCreateActiveSandbox")(function* (
  input: FindOrCreateSandboxInput,
) {
  const result = yield* findOrCreateSandboxUseCase(input)
  if (!result.createdNow) {
    yield* reactivateSandboxUseCase({
      sandboxOrganizationId: result.sandboxOrganizationId,
      actorUserId: input.actorUserId,
    })
  }
  return result
})
