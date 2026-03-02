import { Effect } from "effect";
import type { MembershipCreationError, WorkspaceCreationError } from "../errors.ts";
import type { UserCreated } from "../events/user-created.ts";
import type { MembershipRepository, WorkspaceRepository } from "../ports/repositories.ts";

/**
 * Setup new user use case
 *
 * Creates a default workspace and membership when a new user signs up.
 */

export interface SetupNewUserDeps {
  readonly workspaceRepo: WorkspaceRepository;
  readonly membershipRepo: MembershipRepository;
}

export const setupNewUser = (deps: SetupNewUserDeps) => {
  return (
    event: UserCreated,
  ): Effect.Effect<void, WorkspaceCreationError | MembershipCreationError> => {
    return Effect.gen(function* () {
      const userName = event.name ?? event.email.split("@")[0];
      const workspaceName = `${userName}'s Workspace`;

      // Create workspace
      const workspace = yield* deps.workspaceRepo.create({
        name: workspaceName,
        userId: event.userId,
      });

      // Create membership as owner
      yield* deps.membershipRepo.create({
        userId: event.userId,
        workspaceId: workspace.id,
        role: "owner",
      });

      // Note: No default provider - users configure providers manually
    });
  };
};

export type SetupNewUser = ReturnType<typeof setupNewUser>;
