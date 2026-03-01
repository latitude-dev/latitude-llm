import { createLogger } from "@platform/observability";

/**
 * User created event handler
 *
 * Automatically creates a default workspace for new users.
 * Uses Better Auth's organization API directly.
 */

const logger = createLogger({ service: "user-created-handler" });

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

export const handleUserCreated = async (
  deps: UserCreatedHandlerDeps,
  event: {
    userId: string;
    email: string;
    name?: string;
  },
) => {
  try {
    const userName = event.name ?? event.email.split("@")[0];
    const workspaceName = `${userName}'s Workspace`;
    const slug = generateSlug(workspaceName);

    logger.info("Creating default workspace for new user", {
      userId: event.userId,
      workspaceName,
    });

    // Create workspace using Better Auth's organization API
    const org = await deps.betterAuthApi.organization.create({
      name: workspaceName,
      slug,
      userId: event.userId,
    });

    logger.info("Workspace created successfully", {
      userId: event.userId,
      organizationId: org.id,
    });

    return { success: true, organizationId: org.id };
  } catch (error) {
    logger.error("Failed to create workspace for new user", {
      userId: event.userId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Don't throw - we don't want to block user signup if workspace creation fails
    // User can manually create a workspace later
    return { success: false, error };
  }
};

// Generate URL-friendly slug from name
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
};
