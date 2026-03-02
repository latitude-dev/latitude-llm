import type { UserId } from "./id.ts";

/**
 * User entity - represents a user in the system.
 *
 * This is a minimal read-only representation of a user for domain operations.
 * The actual user storage and management is handled by Better Auth.
 */

export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly name: string | null;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly role: "user" | "admin";
  readonly banned: boolean;
  readonly createdAt: Date;
}
