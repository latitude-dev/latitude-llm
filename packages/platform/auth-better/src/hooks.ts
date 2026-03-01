import type { PostgresDb } from "@platform/db-postgres";

/**
 * Hook handlers for Better Auth events.
 *
 * These hooks allow us to:
 * 1. Sync Better Auth data to our domain tables
 * 2. Publish domain events when auth events occur
 * 3. Initialize organizations when users sign up
 */

export interface AuthHooksConfig {
  readonly db: PostgresDb;
  publishEvent: (event: {
    name: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}

export const createAuthHooks = (config: AuthHooksConfig) => {
  return {
    /**
     * Called after a new user is created.
     * We can create a default organization here.
     */
    userCreated: async (user: { id: string; email: string; name?: string }) => {
      // Publish domain event
      await config.publishEvent({
        name: "UserCreated",
        payload: {
          userId: user.id,
          email: user.email,
          name: user.name,
        },
      });
    },

    /**
     * Called after a user signs in.
     */
    userSignedIn: async (user: { id: string; email: string }) => {
      await config.publishEvent({
        name: "UserLoggedIn",
        payload: {
          userId: user.id,
          email: user.email,
        },
      });
    },

    /**
     * Called after an organization is created.
     */
    organizationCreated: async (
      org: { id: string; name: string; slug: string },
      creator: { id: string },
    ) => {
      // Sync to our organizations table
      // This creates the organization metadata record
      await config.publishEvent({
        name: "OrganizationCreated",
        payload: {
          organizationId: org.id,
          name: org.name,
          slug: org.slug,
          creatorId: creator.id,
        },
      });
    },

    /**
     * Called after a member joins an organization.
     */
    memberJoined: async (org: { id: string }, member: { userId: string; role: string }) => {
      await config.publishEvent({
        name: "MemberJoined",
        payload: {
          organizationId: org.id,
          userId: member.userId,
          role: member.role,
        },
      });
    },
  };
};
