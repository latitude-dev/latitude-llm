import { Effect } from "effect"
import type { ProjectRedactionAuthorizerShape } from "../ports/project-redaction-authorizer.ts"

export const createFakeProjectRedactionAuthorizer = (isAdmin = true): ProjectRedactionAuthorizerShape => ({
  isOrganizationAdmin: () => Effect.succeed(isAdmin),
})
