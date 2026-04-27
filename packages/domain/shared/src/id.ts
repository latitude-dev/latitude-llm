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

/**
 * Branded string ID keyed by a compile-time-only brand (e.g. `"ProjectId"`).
 * Prefer existing named aliases (`ProjectId`, `UserId`, …) at boundaries; this
 * type is the shared shape and works with `generateId<"ProjectId">()`.
 */
export type Id<Brand extends string> = Branded<string, Brand>

export const CUID_LENGTH = 24

export const cuidSchema = z.string().length(CUID_LENGTH)

// User-related IDs
export type UserId = Id<"UserId">

// Organization/Workspace-related IDs (workspace is now organization)
export type OrganizationId = Id<"OrganizationId">
export type MembershipId = Id<"MembershipId">

// Project-related IDs
export type ProjectId = Id<"ProjectId">

// API Key IDs
export type ApiKeyId = Id<"ApiKeyId">

// Dataset-related IDs
export type DatasetId = Id<"DatasetId">
export type DatasetRowId = Id<"DatasetRowId">
export type DatasetVersionId = Id<"DatasetVersionId">

// Reliability-related IDs
export type ScoreId = Id<"ScoreId">
export type IssueId = Id<"IssueId">
export type EvaluationId = Id<"EvaluationId">
export type SimulationId = Id<"SimulationId">
export type AnnotationQueueId = Id<"AnnotationQueueId">
export type AnnotationQueueItemId = Id<"AnnotationQueueItemId">
export type FlaggerId = Id<"FlaggerId">

// Telemetry-related IDs
export type TraceId = Id<"TraceId">
export type SpanId = Id<"SpanId">
export type SessionId = Id<"SessionId">
export type ExternalUserId = Id<"ExternalUserId">

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
export const EvaluationId = (value: string): EvaluationId => value as EvaluationId
export const SimulationId = (value: string): SimulationId => value as SimulationId
export const AnnotationQueueId = (value: string): AnnotationQueueId => value as AnnotationQueueId
export const AnnotationQueueItemId = (value: string): AnnotationQueueItemId => value as AnnotationQueueItemId
export const FlaggerId = (value: string): FlaggerId => value as FlaggerId
export const TraceId = (value: string): TraceId => value as TraceId
export const SpanId = (value: string): SpanId => value as SpanId
export const DatasetId = (value: string): DatasetId => value as DatasetId
export const DatasetRowId = (value: string): DatasetRowId => value as DatasetRowId
export const DatasetVersionId = (value: string): DatasetVersionId => value as DatasetVersionId
export const ExternalUserId = (value: string): ExternalUserId => value as ExternalUserId

/** Zod schemas that parse strings into branded domain IDs (CUID2, length {@link CUID_LENGTH}). */
export const userIdSchema = cuidSchema.transform(UserId)
export const organizationIdSchema = cuidSchema.transform(OrganizationId)
export const membershipIdSchema = cuidSchema.transform(MembershipId)
export const projectIdSchema = cuidSchema.transform(ProjectId)
export const apiKeyIdSchema = cuidSchema.transform(ApiKeyId)
export const datasetIdSchema = cuidSchema.transform(DatasetId)
export const datasetRowIdSchema = cuidSchema.transform(DatasetRowId)
export const datasetVersionIdSchema = cuidSchema.transform(DatasetVersionId)
export const scoreIdSchema = cuidSchema.transform(ScoreId)
export const issueIdSchema = cuidSchema.transform(IssueId)
export const evaluationIdSchema = cuidSchema.transform(EvaluationId)
export const annotationQueueIdSchema = cuidSchema.transform(AnnotationQueueId)
export const annotationQueueItemIdSchema = cuidSchema.transform(AnnotationQueueItemId)
export const flaggerIdSchema = cuidSchema.transform(FlaggerId)
export const simulationIdSchema = cuidSchema.transform(SimulationId)

// The telemetry-related IDs have custom length constraints
export const SESSION_ID_LENGTH = 128
export const sessionIdSchema = z.string().max(SESSION_ID_LENGTH).transform(SessionId)

export const TRACE_ID_LENGTH = 32
export const traceIdSchema = z.string().length(TRACE_ID_LENGTH).transform(TraceId)

export const SPAN_ID_LENGTH = 16
export const spanIdSchema = z.string().length(SPAN_ID_LENGTH).transform(SpanId)

export const EXTERNAL_USER_ID_LENGTH = 128
export const externalUserIdSchema = z.string().max(EXTERNAL_USER_ID_LENGTH).transform(ExternalUserId)

/**
 * Generate a unique ID using CUID2.
 * CUID2 provides 24-25 character URL-safe unique identifiers.
 *
 * Call without type args for an ordinary `string` (e.g. slugs, opaque tokens).
 * Use `generateId<"ProjectId">()` (or another brand literal matching a named ID type)
 * for a compile-time branded ID without an extra `ProjectId(...)` wrapper.
 */
export function generateId(): string
export function generateId<const B extends string>(): Id<B>
export function generateId(): string {
  return createId()
}

/**
 * Validate if a string is a valid CUID2.
 * Uses the official isCuid function from @paralleldrive/cuid2.
 */
export const isValidId = (value: string): boolean => isCuid(value)
