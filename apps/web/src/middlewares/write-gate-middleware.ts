import { ReadOnlyProjectError } from "@domain/shared"
import type { Method } from "@tanstack/react-start"
import { createMiddleware } from "@tanstack/react-start"
import {
  getCurrentProjectScope,
  isReadOnlyScope,
  LIVE_SCOPE,
  type ProjectScope,
} from "../domains/projects/project-scope.tsx"

// POST server fns that are genuine reads (no mutation), so they stay allowed
// even under a read-only scope. Every other POST is treated as a write. The
// `*ForApiKey` reads are POST because they carry a raw API key (which must not
// ride in a GET URL), so they need listing here to survive the gate.
const POST_READ_ALLOWLIST: ReadonlySet<string> = new Set([
  "previewEvaluation",
  "listLinearTeamsForApiKey",
  "listCursorRepositoriesForApiKey",
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
// current ProjectScope onto every outgoing server-fn request; the server half
// reads that scope and rejects writes under a read-only scope.
export const writeGateFnMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => next({ sendContext: { projectScope: getCurrentProjectScope() } }))
  .server(async ({ next, context, method, serverFnMeta }) => {
    const scope = context.projectScope ?? LIVE_SCOPE
    if (isBlockedWrite({ scope, method, serverFnName: serverFnMeta?.name })) {
      throw new ReadOnlyProjectError({ serverFnName: serverFnMeta?.name })
    }
    return next()
  })
