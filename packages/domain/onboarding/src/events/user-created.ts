import { Data } from "effect";

/**
 * User created event
 *
 * Triggered when a new user is created via Better Auth.
 * Used to auto-create workspaces and set up onboarding.
 */

export class UserCreated extends Data.TaggedClass("UserCreated")<{
  readonly userId: string;
  readonly email: string;
  readonly name?: string;
}> {}

export type OnboardingEvent = UserCreated;
