import { createLogger } from "@repo/observability";
import { Effect } from "effect";

/**
 * User created event handler
 *
 * Automatically creates a default workspace for new users.
 * Uses Better Auth's organization API directly.
 */

const logger = createLogger("user-created-handler");

export interface UserCreatedHandlerDeps {
  readonly betterAuthApi: {
    readonly organization: {
      readonly create: (params: {
        name: string;
        slug: string;
        userId: string;
      }) => Promise<{ id: string }>;
    };
  };
}

export interface UserCreatedEvent {
  readonly userId: string;
  readonly email: string;
  readonly name?: string;
}

export interface WorkspaceCreationSuccess {
  readonly success: true;
  readonly organizationId: string;
}

export interface WorkspaceCreationFailure {
  readonly success: false;
  readonly error: string;
}

export type WorkspaceCreationResult = WorkspaceCreationSuccess | WorkspaceCreationFailure;

class WorkspaceCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceCreationError";
  }
}

export const handleUserCreated = (
  deps: UserCreatedHandlerDeps,
  event: UserCreatedEvent,
): Effect.Effect<WorkspaceCreationResult, never> => {
  const userName = event.name ?? event.email.split("@")[0];
  const workspaceName = `${userName}'s Workspace`;
  const slug = generateSlug(workspaceName);

  return Effect.tryPromise({
    try: async () => {
      logger.info(
        `Creating default workspace for new user: ${event.userId}, workspace: ${workspaceName}`,
      );

      const org = await deps.betterAuthApi.organization.create({
        name: workspaceName,
        slug,
        userId: event.userId,
      });

      logger.info(`Workspace created successfully: ${event.userId}, org: ${org.id}`);

      return { success: true as const, organizationId: org.id };
    },
    catch: (error) =>
      new WorkspaceCreationError(error instanceof Error ? error.message : String(error)),
  }).pipe(
    Effect.match({
      onSuccess: (result) => result,
      onFailure: (error) => {
        logger.info(
          `Failed to create workspace for new user: ${event.userId}, error: ${error.message}`,
        );
        // Return failure result - don't propagate error
        return { success: false as const, error: error.message };
      },
    }),
  );
};

// Generate URL-friendly slug from name
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
};
