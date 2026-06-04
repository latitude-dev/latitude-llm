import { organizationIdSchema } from "@domain/shared"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { sandboxMiddleware } from "../../server/sandbox-middleware.ts"

interface SandboxSummaryDto {
  readonly organizationId: string
  readonly name: string
  readonly parentOrgId: string
}

export const getSandbox = createServerFn({ method: "GET" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema }))
  .handler(
    async ({ context }): Promise<SandboxSummaryDto> => ({
      organizationId: context.sandbox.organizationId,
      name: context.sandbox.name,
      parentOrgId: context.sandbox.parentOrgId,
    }),
  )
