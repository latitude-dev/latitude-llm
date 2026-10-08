import type { OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface ProjectRedactionAuthorizerShape {
  readonly isOrganizationAdmin: (
    organizationId: OrganizationId,
    userId: string,
  ) => Effect.Effect<boolean, RepositoryError, SqlClient>
}

export class ProjectRedactionAuthorizer extends Context.Service<
  ProjectRedactionAuthorizer,
  ProjectRedactionAuthorizerShape
>()("@domain/projects/ProjectRedactionAuthorizer") {}
