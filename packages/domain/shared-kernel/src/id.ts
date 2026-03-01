/**
 * Branded ID types for compile-time type safety.
 *
 * These types prevent mixing different entity IDs (e.g., passing a UserId
 * where OrganizationId is expected). The brand is erased at compile time,
 * so these are just strings at runtime with zero overhead.
 */

// Base branded type helper
type Branded<T, B> = T & { readonly __brand: B };

// User-related IDs
export type UserId = Branded<string, "UserId">;
export type SessionId = Branded<string, "SessionId">;

// Organization/Workspace-related IDs (workspace is now organization)
export type OrganizationId = Branded<string, "OrganizationId">;
export type MembershipId = Branded<string, "MembershipId">;

// Project-related IDs
export type ProjectId = Branded<string, "ProjectId">;

// API Key IDs
export type ApiKeyId = Branded<string, "ApiKeyId">;

// Subscription-related IDs
export type SubscriptionId = Branded<string, "SubscriptionId">;
export type GrantId = Branded<string, "GrantId">;

// Factory functions to create branded IDs
// Use these when creating IDs from strings (e.g., from database rows)
export const UserId = (value: string): UserId => value as UserId;
export const SessionId = (value: string): SessionId => value as SessionId;
export const OrganizationId = (value: string): OrganizationId => value as OrganizationId;
export const MembershipId = (value: string): MembershipId => value as MembershipId;
export const ProjectId = (value: string): ProjectId => value as ProjectId;
export const ApiKeyId = (value: string): ApiKeyId => value as ApiKeyId;
export const SubscriptionId = (value: string): SubscriptionId => value as SubscriptionId;
export const GrantId = (value: string): GrantId => value as GrantId;

/**
 * Generate a unique ID using cryptographically secure random UUID.
 * This is the default ID generation strategy for all entities.
 */
export const generateId = (): string => crypto.randomUUID();
