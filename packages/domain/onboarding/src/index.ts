// Events
export { UserCreated, type OnboardingEvent } from "./events/user-created.ts"

// Errors
export {
  MembershipCreationError,
  WorkspaceCreationError,
} from "./errors.ts"

// Ports
export type {
  MembershipRepository,
  WorkspaceRepository,
} from "./ports/repositories.ts"

// Use cases
export {
  setupNewUser,
  type SetupNewUser,
  type SetupNewUserDeps,
} from "./use-cases/setup-new-user.ts"
