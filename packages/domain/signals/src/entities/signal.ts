import { scoreSourceTypeSchema } from "@domain/scores"
import { cuidSchema, SLUG_MAX_LENGTH, signalIdSchema } from "@domain/shared"
import { z } from "zod"
import { SIGNAL_NAME_MAX_LENGTH, SIGNAL_PRIORITIES, SIGNAL_SOURCES, SIGNAL_STATES } from "../constants.ts"

// ---------------------------------------------------------------------------
// SignalState
// ---------------------------------------------------------------------------

export const signalStateSchema = z.enum(SIGNAL_STATES)
export type SignalState = z.infer<typeof signalStateSchema>

export const signalSourceSchema = z.enum(SIGNAL_SOURCES)
export type SignalSource = z.infer<typeof signalSourceSchema>

export const signalPrioritySchema = z.enum(SIGNAL_PRIORITIES)
export type SignalPriority = z.infer<typeof signalPrioritySchema>

export const SignalPriority = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Urgent: "urgent",
} as const satisfies Record<string, SignalPriority>

export const SignalState = {
  New: "new",
  Escalating: "escalating",
  Ongoing: "ongoing",
} as const satisfies Record<string, SignalState>

// ---------------------------------------------------------------------------
// SignalCentroid
// ---------------------------------------------------------------------------

export const signalCentroidSchema = z.object({
  base: z.array(z.number()), // running vector sum of normalized, weighted, decayed member embeddings
  mass: z.number(), // running scalar mass of the centroid
  model: z.string(), // embedding model used to compute the centroid
  decay: z.number().positive(), // half-life in seconds
  weights: z.record(scoreSourceTypeSchema, z.number().nonnegative()), // source weights used in centroid updates
})

export type SignalCentroid = z.infer<typeof signalCentroidSchema>

export const signalSchema = z.object({
  id: signalIdSchema, // CUID issue identifier
  organizationId: cuidSchema, // owning organization
  projectId: cuidSchema, // owning project
  slug: z.string().min(1).max(SLUG_MAX_LENGTH), // url-safe identifier derived from name; regenerated when name changes via `refreshSignalDetailsUseCase`. Unique per (organization_id, project_id).
  name: z.string().min(1).max(SIGNAL_NAME_MAX_LENGTH), // generated from clustered score feedback and related evaluation/annotation context; generic enough to represent the shared failure pattern across different backgrounds
  description: z.string().min(1), // generated from clustered score feedback; focused on the underlying problem rather than one specific conversation; helps both human understanding and BM25 matching
  source: signalSourceSchema, // provenance of the first creating score
  assigneeId: cuidSchema.nullable(), // user (org member) manually assigned to triage this issue; null when unassigned
  priority: signalPrioritySchema.nullable(), // manual triage priority; null when unset
  centroid: signalCentroidSchema, // running weighted sum of clustered score feedback embeddings; drives derived pgvector semantic matching.
  clusteredAt: z.date(), // last time the centroid/cluster state was refreshed; authoritative decay anchor (not updatedAt)
  mutedAt: z.date().nullable(),
  createdAt: z.date(), // issue creation time
  updatedAt: z.date(), // issue update time
})

export type Signal = z.infer<typeof signalSchema>
