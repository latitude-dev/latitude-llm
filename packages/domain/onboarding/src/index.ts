// Events
export { UserCreated, type OnboardingEvent } from "./events/user-created.js";

// Errors
export {
  MembershipCreationError,
  WorkspaceCreationError,
} from "./errors.js";

// Ports
export type {
  MembershipRepository,
  WorkspaceRepository,
} from "./ports/repositories.js";

// Use cases
export {
  setupNewUser,
  type SetupNewUser,
  type SetupNewUserDeps,
} from "./use-cases/setup-new-user.js";
