import { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { ISSUE_DISCOVERY_MAX_CANDIDATES, ISSUE_DISCOVERY_SEARCH_RATIO } from "../constants.ts"
import type {
  DeleteIssueProjectionInput,
  HybridSearchInput,
  IssueProjectionCandidate,
  UpsertIssueProjectionInput,
} from "../ports/issue-projection-repository.ts"

interface StoredProjection {
  uuid: string
  title: string
  description: string
  vector: number[]
  organizationId: string
  projectId: string
}

const cosineSimilarity = (a: number[], b: number[]): number => {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0)
    normA += (a[i] ?? 0) ** 2
    normB += (b[i] ?? 0) ** 2
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

const bm25TermScore = (term: string, text: string): number => {
  const words = text.toLowerCase().split(/\s+/)
  const tf = words.filter((w) => w.includes(term.toLowerCase())).length
  if (tf === 0) return 0
  return tf / (tf + 1)
}

interface CreateFakeIssueProjectionRepositoryOptions {
  readonly organizationId?: string
  readonly store?: Map<string, StoredProjection>
}

export const createFakeIssueProjectionRepository = ({
  organizationId = "org1",
  store = new Map<string, StoredProjection>(),
}: CreateFakeIssueProjectionRepositoryOptions = {}) => {
  const keyOf = (projectId: string, uuid: string) => `${organizationId}_${projectId}::${uuid}`

  const service = {
    upsert: (input: UpsertIssueProjectionInput) =>
      Effect.try({
        try: () => {
          store.set(keyOf(input.projectId, input.uuid), {
            uuid: input.uuid,
            title: input.title,
            description: input.description,
            vector: input.vector,
            organizationId,
            projectId: input.projectId,
          })
        },
        catch: (cause) => new RepositoryError({ cause, operation: "IssueProjectionRepository.upsert" }),
      }),

    delete: (input: DeleteIssueProjectionInput) =>
      Effect.try({
        try: () => {
          store.delete(keyOf(input.projectId, input.uuid))
        },
        catch: (cause) => new RepositoryError({ cause, operation: "IssueProjectionRepository.delete" }),
      }),

    hybridSearch: (input: HybridSearchInput) =>
      Effect.try({
        try: (): readonly IssueProjectionCandidate[] => {
          const candidates: (StoredProjection & { score: number })[] = []

          for (const projection of store.values()) {
            if (projection.organizationId !== organizationId || projection.projectId !== input.projectId) continue

            const vectorScore = cosineSimilarity(input.vector, projection.vector)

            const queryTerms = input.query.toLowerCase().split(/\s+/)
            const text = `${projection.title} ${projection.description}`
            let bm25Score = 0
            for (const term of queryTerms) {
              const termScore = bm25TermScore(term, text)
              if (termScore > 0) {
                bm25Score += termScore
              }
            }

            const combined = ISSUE_DISCOVERY_SEARCH_RATIO * vectorScore + (1 - ISSUE_DISCOVERY_SEARCH_RATIO) * bm25Score

            candidates.push({ ...projection, score: combined })
          }

          candidates.sort((a, b) => b.score - a.score)

          return candidates.slice(0, ISSUE_DISCOVERY_MAX_CANDIDATES).map((c) => ({
            uuid: c.uuid,
            title: c.title,
            description: c.description,
            score: c.score,
          }))
        },
        catch: (cause) => new RepositoryError({ cause, operation: "IssueProjectionRepository.hybridSearch" }),
      }),
  }

  return { service, store }
}
