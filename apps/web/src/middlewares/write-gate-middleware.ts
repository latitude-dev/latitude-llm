import { ReadOnlyProjectError } from "@domain/shared"
import type { Method } from "@tanstack/react-start"
import { createMiddleware } from "@tanstack/react-start"
import { openReadOnlyProjectModal } from "../components/read-only-project-modal.ts"
import {
  getCurrentProjectScope,
  isReadOnlyScope,
  LIVE_SCOPE,
  type ProjectScope,
} from "../domains/projects/project-scope.tsx"
import { isReadOnlyProjectError } from "../lib/errors.ts"

// POST server fns that are NOT project-data mutations, so they stay allowed
// even under a read-only scope. Every other POST is treated as a write. Two
// kinds live here: genuine reads that must be POST because they carry a raw API
// key (which must not ride in a GET URL — the `*ForApiKey` fns), and session/
// chrome-state writes that touch no tenant data (e.g. `rememberLastProjectSlug`
// sets the last-visited cookie — it fires from the project layout's mount
// effect on every page, showcase included, so blocking it would reject on every
// showcase visit as an unhandled rejection).
//
// These strings must match the compiler-embedded `serverFnMeta.name`. Renaming
// one of these fns without updating this set makes it throw ReadOnlyProjectError
// under showcase (fail-closed — visible, not a bypass). Grep the fn name here
// when renaming: previewEvaluation (@domain/evaluations preview),
// listLinearTeamsForApiKey / listCursorRepositoriesForApiKey (agent-dispatch),
// rememberLastProjectSlug (projects.functions.ts), dismissShowcase
// (organizations.functions.ts — the "Remove demo" action, a write to the
// viewer's OWN org that fires while viewing the showcase, so it must be exempt),
// reportClientError (client-error-reporting.tsx — error telemetry fired by the
// content error boundary on ANY page error, showcase included; it writes no
// tenant data, and blocking it swallows the real error behind a ReadOnlyProjectError).
const POST_READ_ALLOWLIST: ReadonlySet<string> = new Set([
  "previewEvaluation",
  "listLinearTeamsForApiKey",
  "listCursorRepositoriesForApiKey",
  "rememberLastProjectSlug",
  "dismissShowcase",
  "reportClientError",
])

/**
 * Read-only enforcement (layer 2): a write is blocked when the request runs
 * under a read-only scope (showcase/public) and the method is a write. Method
 * discipline makes this reliable — no write is a `GET`, so all GETs pass; writes
 * are `POST`, minus the few POST-reads on the allowlist. This is a client hint
 * (scope is spoofable), so it produces a clean error — the security boundary is
 * structural org-scoping, not this gate. `serverFnName` is `undefined` only if
 * the compiler didn't embed it; fail closed for an unidentifiable write.
 */
export const isBlockedWrite = ({
  scope,
  method,
  serverFnName,
}: {
  readonly scope: ProjectScope
  readonly method: Method
  readonly serverFnName: string | undefined
}): boolean => {
  if (!isReadOnlyScope(scope)) return false
  if (method !== "POST") return false
  return serverFnName === undefined || !POST_READ_ALLOWLIST.has(serverFnName)
}

// One entry does both halves of the write-gate: the client half stamps the
// current ProjectScope onto every outgoing server-fn request AND — since every
// write (useMutation, TanStack DB collection, or a direct server-fn call) flows
// through here — opens the read-only "demo" modal when the server rejects with
// ReadOnlyProjectError. This is the single choke point for the modal, so no
// per-call-site wiring is needed. The server half reads that scope and rejects
// writes under a read-only scope. The error is re-thrown either way, so callers
// still settle normally (their local catches may show their own message; the
// modal is the primary surface).
export const writeGateFnMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    try {
      return await next({ sendContext: { projectScope: getCurrentProjectScope() } })
    } catch (error) {
      if (isReadOnlyProjectError(error)) openReadOnlyProjectModal()
      throw error
    }
  })
  .server(async ({ next, context, method, serverFnMeta }) => {
    const scope = context.projectScope ?? LIVE_SCOPE
    if (isBlockedWrite({ scope, method, serverFnName: serverFnMeta?.name })) {
      throw new ReadOnlyProjectError({ serverFnName: serverFnMeta?.name })
    }
    return next()
  })
