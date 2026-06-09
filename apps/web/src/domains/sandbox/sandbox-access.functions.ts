import { UnauthorizedError, UserId } from "@domain/shared"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { resolveSandboxAccess } from "../../server/sandbox-access.ts"
import { getFreshSession } from "../sessions/session.functions.ts"

/**
 * Server-side resolution of "is the caller allowed to act on this sandbox?".
 *
 * The actual authorization lives in `server/sandbox-access.ts` (a plain
 * function) so it can be shared without one server fn calling another over
 * HTTP. This thin server fn exists for `sandboxMiddleware`, which must delegate
 * to a server fn (not import the Node-only logic directly) to keep its module
 * free of server-only imports in the browser bundle — exactly as
 * `adminMiddleware` delegates to `getFreshSession`.
 */

interface SandboxAccessDto {
  readonly userId: string
  readonly sandbox: {
    readonly organizationId: string
    readonly name: string
    readonly parentOrgId: string
  }
}

export const authorizeSandboxAccess = createServerFn({ method: "GET" })
  .inputValidator(z.object({ sandboxOrgId: z.unknown() }))
  .handler(async ({ data }): Promise<SandboxAccessDto> => {
    const session = await getFreshSession()
    if (!session) {
      throw new UnauthorizedError({ message: "Unauthorized" })
    }
    const userId = UserId(session.user.id)

    const sandbox = await resolveSandboxAccess({ sandboxOrgId: data.sandboxOrgId, userId })

    return {
      userId,
      sandbox: {
        organizationId: sandbox.organizationId,
        name: sandbox.name,
        parentOrgId: sandbox.parentOrgId,
      },
    }
  })
