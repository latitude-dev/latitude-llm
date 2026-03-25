import { scoreSourceSchema } from "@domain/scores"
import { cuidSchema, IssueId } from "@domain/shared"
import { z } from "zod"
import { ISSUE_STATES } from "../constants.ts"

// ---------------------------------------------------------------------------
// IssueState
// ---------------------------------------------------------------------------

export const issueStateSchema = z.enum(ISSUE_STATES)
export type IssueState = z.infer<typeof issueStateSchema>

export const IssueState = {
  New: "new",
  Escalating: "escalating",
  Resolved: "resolved",
  Regressed: "regressed",
  Ignored: "ignored",
} as const satisfies Record<string, IssueState>

// ---------------------------------------------------------------------------
// IssueCentroid
// ---------------------------------------------------------------------------

export const issueCentroidSchema = z.object({
  base: z.array(z.number()), // running vector sum of normalized, weighted, decayed member embeddings
  mass: z.number(), // running scalar mass of the centroid
  model: z.string(), // embedding model used to compute the centroid
  decay: z.number().positive(), // half-life in seconds
  weights: z.record(scoreSourceSchema, z.number().nonnegative()), // source weights used in centroid updates
})

export type IssueCentroid = z.infer<typeof issueCentroidSchema>

// ---------------------------------------------------------------------------
// Issue entity
// ---------------------------------------------------------------------------

export const issueIdSchema = cuidSchema.transform(IssueId)

export const issueSchema = z.object({
  id: issueIdSchema, // CUID issue identifier
  uuid: z.string().uuid(), // links the Postgres row with the Weaviate object
  organizationId: cuidSchema, // owning organization
  projectId: cuidSchema, // owning project
  name: z.string().min(1).max(128), // generated from clustered score feedback and related evaluation/annotation context; generic enough to represent the shared failure pattern across different backgrounds
  description: z.string().min(1), // generated from clustered score feedback; focused on the underlying problem rather than one specific conversation; helps both human understanding and BM25 matching
  centroid: issueCentroidSchema, // running weighted sum of clustered score feedback embeddings; drives semantic matching in Weaviate
  clusteredAt: z.date(), // last time the centroid/cluster state was refreshed; authoritative decay anchor (not updatedAt)
  escalatedAt: z.date().nullable(), // latest escalation transition timestamp
  resolvedAt: z.date().nullable(), // issue resolved automatically or manually
  ignoredAt: z.date().nullable(), // issue ignored manually
  createdAt: z.date(), // issue creation time
  updatedAt: z.date(), // issue update time
})

export type Issue = z.infer<typeof issueSchema>
