import { MembershipRepository } from "@domain/organizations"
import { ProjectRedactionAuthorizer } from "@domain/projects"
import { Effect, Layer } from "effect"
import { MembershipRepositoryLive } from "./repositories/membership-repository.ts"

const projectRedactionAuthorizerFromMembershipLive = Layer.effect(
  ProjectRedactionAuthorizer,
  Effect.gen(function* () {
    const memberships = yield* MembershipRepository

    return {
      isOrganizationAdmin: (organizationId, userId) => memberships.isAdmin(organizationId, userId),
    }
  }),
)

export const ProjectRedactionAuthorizerLive = projectRedactionAuthorizerFromMembershipLive.pipe(
  Layer.provide(MembershipRepositoryLive),
)
