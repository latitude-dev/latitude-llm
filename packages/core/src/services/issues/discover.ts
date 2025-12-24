import { env } from '@latitude-data/env'
import { Bm25Operator } from 'weaviate-client'
import { cache as getCache } from '../../cache'
import { database } from '../../client'
import {
  CLOUD_MESSAGES,
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  ISSUE_DISCOVERY_MAX_CANDIDATES,
  ISSUE_DISCOVERY_MIN_KEYWORDS,
  ISSUE_DISCOVERY_MIN_RELEVANCE,
  ISSUE_DISCOVERY_MIN_SIMILARITY,
  ISSUE_DISCOVERY_RERANK_CACHE_KEY,
  ISSUE_DISCOVERY_RERANK_MODEL,
  ISSUE_DISCOVERY_SEARCH_RATIO,
  IssueCandidate,
} from '../../constants'
import { UnprocessableEntityError } from '../../lib/errors'
import { hashContent } from '../../lib/hashContent'
import { Result, TypedResult } from '../../lib/Result'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type ResultWithEvaluationV2 } from '../../schema/types'
import { voyage as getVoyageClient } from '../../voyage'
import {
  getIssuesCollection,
  ISSUES_COLLECTION_TENANT_NAME,
} from '../../weaviate'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'
import { validateResultForIssue } from './results/validate'
import { embedReason, normalizeEmbedding } from './shared'

/**
 * Discovers potential issues by analyzing evaluation results and searching for similar issues.
 *
 * This function performs issue discovery by:
 * 1. Validating the evaluation result is suitable for issue discovery
 * 2. Extracting the reason from the evaluation specification
 * 3. Generating an embedding for the reason
 * 4. Finding candidate issues using hybrid search (vector + keyword)
 * 5. Reranking candidates to find the most relevant match
 *
 * @template T - The evaluation type
 * @template M - The evaluation metric type
 * @param params - The parameters object
 * @param params.result - The evaluation result containing the result and evaluation metadata
 * @param params.document - The document version associated with the evaluation
 * @param params.project - The project containing the document
 * @param db - Optional database instance (defaults to the global database)
 * @returns A Result containing the embedding vector and optionally a matched issue candidate
 * @throws Returns an error if not running in cloud environment or if validation/processing fails
 */
export async function discoverIssue<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    result: { result, evaluation },
    document,
    project,
  }: {
    result: ResultWithEvaluationV2<T, M>
    document: DocumentVersion
    project: Project
  },
  db = database,
): Promise<TypedResult<{ embedding: number[]; issue?: IssueCandidate }>> {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(new Error(CLOUD_MESSAGES.issueDiscovery))
  }

  const validating = await validateResultForIssue(
    { result: { result, evaluation } },
    db,
  )
  if (validating.error) {
    return Result.error(validating.error)
  }

  const specification = getEvaluationMetricSpecification(evaluation)
  const reason = specification.resultReason(
    result as EvaluationResultSuccessValue<T, M>,
  )!

  const embedying = await embedReason(reason)
  if (embedying.error) {
    return Result.error(embedying.error)
  }
  let embedding = embedying.value
  if (!embedding) return Result.ok({ embedding: [] })

  embedding = normalizeEmbedding(embedding)

  const finding = await findCandidates({ reason, embedding, document, project })
  if (finding.error) {
    return Result.error(finding.error)
  }
  let candidates = finding.value

  if (candidates.length === 0) {
    return Result.ok({ embedding })
  }

  // Note: if there is only one candidate we still pass
  // it to the reranker to get a relevance score
  const reranking = await rerankCandidates({ reason, candidates })
  if (reranking.error) {
    return Result.error(reranking.error)
  }
  candidates = reranking.value

  if (candidates.length === 0) {
    return Result.ok({ embedding })
  }

  return Result.ok({ embedding, issue: candidates[0] })
}

async function findCandidates({
  reason,
  embedding,
  document,
  project,
}: {
  reason: string
  embedding: number[]
  document: DocumentVersion
  project: Project
}) {
  try {
    const tenantName = ISSUES_COLLECTION_TENANT_NAME(project.workspaceId, project.id, document.documentUuid) // prettier-ignore
    const issues = await getIssuesCollection({ tenantName })

    const { objects } = await issues.query.hybrid(reason, {
      vector: embedding,
      alpha: ISSUE_DISCOVERY_SEARCH_RATIO,
      maxVectorDistance: 1 - ISSUE_DISCOVERY_MIN_SIMILARITY,
      bm25Operator: Bm25Operator.or({
        minimumMatch: ISSUE_DISCOVERY_MIN_KEYWORDS,
      }),
      fusionType: 'RelativeScore',
      limit: ISSUE_DISCOVERY_MAX_CANDIDATES,
      returnProperties: ['title', 'description'],
      returnMetadata: ['score'],
    })

    const candidates = objects
      .map((object) => ({
        uuid: object.uuid,
        title: object.properties.title,
        description: object.properties.description,
        score: object.metadata!.score!,
      }))
      .slice(0, ISSUE_DISCOVERY_MAX_CANDIDATES)

    return Result.ok<IssueCandidate[]>(candidates)
  } catch (error) {
    return Result.error(error as Error)
  }
}

async function rerankCandidates({
  reason,
  candidates,
}: {
  reason: string
  candidates: IssueCandidate[]
}) {
  try {
    const cache = await getCache()
    const key = ISSUE_DISCOVERY_RERANK_CACHE_KEY(
      hashContent(
        reason +
          candidates.map((candidate) => candidate.uuid + candidate.description),
      ),
    )

    try {
      const item = await cache.get(key)
      if (item) return Result.ok<IssueCandidate[]>(JSON.parse(item))
    } catch (_) {
      // Note: doing nothing
    }

    const voyage = await getVoyageClient()

    const response = await voyage.rerank({
      query: reason,
      documents: candidates.map((candidate) => candidate.description),
      model: ISSUE_DISCOVERY_RERANK_MODEL,
      returnDocuments: false,
      truncation: false,
    })

    if (!response.data || response.data.length === 0) {
      return Result.error(
        new UnprocessableEntityError('Voyage did not return a reranking'),
      )
    }

    candidates = response.data
      .filter(
        (item) => (item.relevanceScore ?? 0) >= ISSUE_DISCOVERY_MIN_RELEVANCE,
      )
      .map((item) => ({
        ...candidates[item.index!],
        score: (candidates[item.index!].score + item.relevanceScore!) / 2,
      }))
      .slice(0, ISSUE_DISCOVERY_MAX_CANDIDATES)

    try {
      const item = JSON.stringify(candidates)
      await cache.set(key, item)
    } catch (_) {
      // Note: doing nothing
    }

    return Result.ok<IssueCandidate[]>(candidates)
  } catch (error) {
    return Result.error(error as Error)
  }
}
