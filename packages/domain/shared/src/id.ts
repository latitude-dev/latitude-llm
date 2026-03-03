/**
 * Branded ID types for compile-time type safety.
 *
 * These types prevent mixing different entity IDs (e.g., passing a UserId
 * where OrganizationId is expected). The brand is erased at compile time,
 * so these are just strings at runtime with zero overhead.
 */

import { createId, isCuid } from "@paralleldrive/cuid2"

// Base branded type helper
type Branded<T, B> = T & { readonly __brand: B }

// User-related IDs
export type UserId = Branded<string, "UserId">

// Organization/Workspace-related IDs (workspace is now organization)
export type OrganizationId = Branded<string, "OrganizationId">
export type MembershipId = Branded<string, "MembershipId">

// Project-related IDs
export type ProjectId = Branded<string, "ProjectId">

// API Key IDs
export type ApiKeyId = Branded<string, "ApiKeyId">

// Subscription-related IDs
export type SubscriptionId = Branded<string, "SubscriptionId">
export type GrantId = Branded<string, "GrantId">

// Telemetry-related IDs
export type TraceId = Branded<string, "TraceId">
export type SpanId = Branded<string, "SpanId">
export type SessionId = Branded<string, "SessionId">

// Factory functions to create branded IDs
// Use these when creating IDs from strings (e.g., from database rows)
export const UserId = (value: string): UserId => value as UserId
export const SessionId = (value: string): SessionId => value as SessionId
export const OrganizationId = (value: string): OrganizationId => value as OrganizationId
export const MembershipId = (value: string): MembershipId => value as MembershipId
export const ProjectId = (value: string): ProjectId => value as ProjectId
export const ApiKeyId = (value: string): ApiKeyId => value as ApiKeyId
export const SubscriptionId = (value: string): SubscriptionId => value as SubscriptionId
export const GrantId = (value: string): GrantId => value as GrantId
export const TraceId = (value: string): TraceId => value as TraceId
export const SpanId = (value: string): SpanId => value as SpanId

/**
 * Generate a unique ID using CUID2.
 * CUID2 provides 24-25 character URL-safe unique identifiers.
 */
export const generateId = (): string => createId()

/**
 * Validate if a string is a valid CUID2.
 * Uses the official isCuid function from @paralleldrive/cuid2.
 */
export const isValidId = (value: string): boolean => isCuid(value)
