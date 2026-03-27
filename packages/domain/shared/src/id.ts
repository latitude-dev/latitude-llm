/**
 * Branded ID types for compile-time type safety.
 *
 * These types prevent mixing different entity IDs (e.g., passing a UserId
 * where OrganizationId is expected). The brand is erased at compile time,
 * so these are just strings at runtime with zero overhead.
 */

import { createId, isCuid } from "@paralleldrive/cuid2"
import { z } from "zod"

// Base branded type helper
type Branded<T, B> = T & { readonly __brand: B }

export const CUID_LENGTH = 24

export const cuidSchema = z.string().length(CUID_LENGTH)

// User-related IDs
export type UserId = Branded<string, "UserId">

// Organization/Workspace-related IDs (workspace is now organization)
export type OrganizationId = Branded<string, "OrganizationId">
export type MembershipId = Branded<string, "MembershipId">

// Project-related IDs
export type ProjectId = Branded<string, "ProjectId">

// API Key IDs
export type ApiKeyId = Branded<string, "ApiKeyId">

// Dataset-related IDs
export type DatasetId = Branded<string, "DatasetId">
export type DatasetRowId = Branded<string, "DatasetRowId">
export type DatasetVersionId = Branded<string, "DatasetVersionId">

// Reliability-related IDs
export type ScoreId = Branded<string, "ScoreId">
export type IssueId = Branded<string, "IssueId">

// Telemetry-related IDs
export type TraceId = Branded<string, "TraceId">
export type SpanId = Branded<string, "SpanId">
export type SessionId = Branded<string, "SessionId">
/** User identifier from external telemetry instrumentation, not the platform User entity. */
export type ExternalUserId = Branded<string, "ExternalUserId">

// Factory functions to create branded IDs
// Use these when creating IDs from strings (e.g., from database rows)
export const UserId = (value: string): UserId => value as UserId
export const SessionId = (value: string): SessionId => value as SessionId
export const OrganizationId = (value: string): OrganizationId => value as OrganizationId
export const MembershipId = (value: string): MembershipId => value as MembershipId
export const ProjectId = (value: string): ProjectId => value as ProjectId
export const ApiKeyId = (value: string): ApiKeyId => value as ApiKeyId
export const ScoreId = (value: string): ScoreId => value as ScoreId
export const IssueId = (value: string): IssueId => value as IssueId
export const TraceId = (value: string): TraceId => value as TraceId
export const SpanId = (value: string): SpanId => value as SpanId
export const DatasetId = (value: string): DatasetId => value as DatasetId
export const DatasetRowId = (value: string): DatasetRowId => value as DatasetRowId
export const DatasetVersionId = (value: string): DatasetVersionId => value as DatasetVersionId
export const ExternalUserId = (value: string): ExternalUserId => value as ExternalUserId

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
