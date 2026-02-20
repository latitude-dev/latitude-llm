import { and, eq } from 'drizzle-orm'
import { scan } from 'promptl-ai'
import {
  EvaluationType,
  EvaluationV2,
  OPTIMIZATION_MAX_ROWS,
  OPTIMIZATION_MIN_ROWS,
  OPTIMIZATION_TESTSET_SPLIT,
  Span,
  SpanType,
  SpanWithDetails,
} from '../../constants'
import { getSpansByEvaluation } from '../../data-access/evaluations/getSpansByEvaluation'
import { getSpansByDocument } from '../../data-access/spans/getSpansByDocument'
import { publisher } from '../../events/publisher'
import { executeOptimizationJobKey } from '../../jobs/job-definitions/optimizations/executeOptimizationJob'
import { queues } from '../../jobs/queues'
import { NotFoundError, UnprocessableEntityError } from '../../lib/errors'
import { hashObject } from '../../lib/hashObject'
import { interleaveList } from '../../lib/interleaveList'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { findActiveIssuesByDocument } from '../../queries/issues/findActiveByDocument'
import { getSpansByIssueForOptimization } from '../../queries/issues/getSpansByIssueForOptimization'
import { getSpansWithoutIssues } from '../../queries/issues/getSpansWithoutIssues'
import { findProjectById } from '../../queries/projects/findById'
import { findWorkspaceUserById } from '../../queries/users/findInWorkspace'
import {
  CommitsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
} from '../../repositories'
import { DatasetRowData } from '../../schema/models/datasetRows'
import { Column } from '../../schema/models/datasets'
import { optimizations } from '../../schema/models/optimizations'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { Optimization } from '../../schema/models/types/Optimization'
import { Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Cursor } from '../../schema/types'
import { insertRowsInBatch } from '../datasetRows/insertRowsInBatch'
import { createDataset } from '../datasets/create'
import { buildColumns, nanoidHashAlgorithm } from '../datasets/utils'
import { maskParameter, raiseForAborted } from './shared'

export async function prepareOptimization(
  {
    optimization,
    workspace,
    abortSignal,
  }: {
    optimization: Optimization
    workspace: Workspace
    abortSignal?: AbortSignal
  },
  transaction = new Transaction(),
) {
  raiseForAborted(abortSignal)

  if (optimization.preparedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already prepared'),
    )
  }

  if (optimization.finishedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already ended'),
    )
  }

  let trainset, testset
  if (optimization.trainsetId && optimization.testsetId) {
    const repository = new DatasetsRepository(workspace.id)

    const gettingtr = await repository.find(optimization.trainsetId)
    if (gettingtr.error) {
      return Result.error(gettingtr.error)
    }
    trainset = gettingtr.value

    const gettingts = await repository.find(optimization.testsetId)
    if (gettingts.error) {
      return Result.error(gettingts.error)
    }
    testset = gettingts.value
  } else {
    const project = await findProjectById({
      workspaceId: workspace.id,
      id: optimization.projectId,
    })
    if (!project) {
      return Result.error(new NotFoundError('Project not found'))
    }

    const commitsRepository = new CommitsRepository(workspace.id)
    const gettingco = await commitsRepository.getCommitById(
      optimization.baselineCommitId,
    )
    if (gettingco.error) {
      return Result.error(gettingco.error)
    }
    const baselineCommit = gettingco.value

    const documentsRepository = new DocumentVersionsRepository(workspace.id)
    const gettingdo = await documentsRepository.getDocumentAtCommit({
      commitUuid: baselineCommit.uuid,
      documentUuid: optimization.documentUuid,
    })
    if (gettingdo.error) {
      return Result.error(gettingdo.error)
    }
    const document = gettingdo.value

    const gettingis = await getIssueCandidates({
      project: project,
      baselineCommit: baselineCommit,
      document: document,
      optimization: optimization,
      workspace: workspace,
    })
    if (gettingis.error) {
      return Result.error(gettingis.error)
    }
    const issues = gettingis.value

    const { parameters } = await scan({ prompt: optimization.baselinePrompt })
    const { keyhash: parametersHash } = hashObject(
      Object.fromEntries(parameters.entries()),
    )

    const seenSpans = new Set<string>()
    const seenParameters = new Set<string>()
    const metadatasRepository = new SpanMetadatasRepository(workspace.id)

    const validateSpan = createSpanValidator({
      parametersHash,
      seenSpans,
      seenParameters,
      metadatasRepository,
    })

    const gettingne = await getNegativeExamples({
      trackedIssues: issues.tracked,
      otherIssues: issues.other,
      evaluation: issues.evaluation,
      evaluations: issues.evaluations,
      document: document,
      validateSpan: validateSpan,
      baselineCommit: baselineCommit,
      optimization: optimization,
      workspace: workspace,
      abortSignal: abortSignal,
    })
    if (gettingne.error) {
      return Result.error(gettingne.error)
    }
    let negatives = gettingne.value

    const gettingpo = await getPositiveExamples({
      validateSpan: validateSpan,
      baselineCommit: baselineCommit,
      document: document,
      optimization: optimization,
      workspace: workspace,
      abortSignal: abortSignal,
    })
    if (gettingpo.error) {
      return Result.error(gettingpo.error)
    }
    let positives = gettingpo.value

    const gettingex = await getExamples({
      negatives: negatives,
      positives: positives,
      validateSpan: validateSpan,
      baselineCommit: baselineCommit,
      document: document,
      optimization: optimization,
      workspace: workspace,
      abortSignal: abortSignal,
    })
    if (gettingex.error) {
      return Result.error(gettingex.error)
    }
    negatives = gettingex.value.negatives
    positives = gettingex.value.positives

    // Note: this cannot be inside the same transaction as the parent, because
    // of limitations of the transaction class. When this finishes it will
    // close the underlying transaction and the following transaction call
    // will not trigger the callbacks correctly
    const creating = await createDatasets({
      parameters: Array.from(parameters),
      negatives: negatives,
      positives: positives,
      baselineCommit: baselineCommit,
      optimization: optimization,
      workspace: workspace,
      abortSignal: abortSignal,
    })
    if (creating.error) {
      return Result.error(creating.error)
    }
    trainset = creating.value.trainset
    testset = creating.value.testset
  }

  return await transaction.call(
    async (tx) => {
      const now = new Date()

      optimization = (await tx
        .update(optimizations)
        .set({
          trainsetId: trainset.id,
          testsetId: testset.id,
          preparedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(optimizations.workspaceId, workspace.id),
            eq(optimizations.id, optimization.id),
          ),
        )
        .returning()
        .then((r) => r[0]!)) as Optimization

      return Result.ok({ optimization, trainset, testset })
    },
    async ({ optimization }) => {
      const payload = {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      }

      const { optimizationsQueue } = await queues()
      await optimizationsQueue.add('executeOptimizationJob', payload, {
        jobId: `${optimization.uuid}-executeOptimizationJob`,
        attempts: 1,
        deduplication: { id: executeOptimizationJobKey(payload) },
      })

      await publisher.publishLater({
        type: 'optimizationPrepared',
        data: payload,
      })
    },
  )
}

async function getIssueCandidates({
  project,
  baselineCommit,
  document,
  optimization,
  workspace,
}: {
  project: Project
  baselineCommit: Commit
  document: DocumentVersion
  optimization: Optimization
  workspace: Workspace
}) {
  const issues = await findActiveIssuesByDocument({
    workspaceId: workspace.id,
    project: project,
    commit: baselineCommit,
    document: document,
  })

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const listing = await evaluationsRepository.listAtCommitByDocument({
    commitId: baselineCommit.id,
    documentUuid: document.documentUuid,
  })
  if (listing.error) {
    return Result.error(listing.error)
  }
  const evaluations = listing.value

  const evaluation = evaluations.find(
    (e) => e.uuid === optimization.evaluationUuid,
  )
  if (!evaluation) {
    return Result.error(new NotFoundError('Optimization evaluation not found'))
  }

  const tracked: Issue[] = []

  if (evaluation.issueId) {
    const issue = issues.find((i) => i.id === evaluation.issueId)
    if (issue) tracked.push(issue)
  } else if (evaluation.type === EvaluationType.Composite) {
    for (const uuid of (evaluation as EvaluationV2<EvaluationType.Composite>)
      .configuration.evaluationUuids) {
      const subevaluation = evaluations.find((e) => e.uuid === uuid)
      if (!subevaluation?.issueId) continue

      const issue = issues.find((i) => i.id === subevaluation.issueId)
      if (!issue) continue

      tracked.push(issue)
    }
  }

  const other = issues.filter((i) => !tracked.includes(i))

  return Result.ok({ tracked, other, evaluation, evaluations })
}

const SPANS_BATCH_SIZE = 100
const SPANS_MAX_SEARCH = 3 // Try to search at most 3 times to get enough spans

type SpanValidator = (
  span: Pick<Span<SpanType.Prompt>, 'id' | 'traceId'>,
) => Promise<SpanWithDetails<SpanType.Prompt> | null>

function createSpanValidator({
  parametersHash,
  seenSpans,
  seenParameters,
  metadatasRepository,
}: {
  parametersHash: string
  seenSpans: Set<string>
  seenParameters: Set<string>
  metadatasRepository: SpanMetadatasRepository
}): SpanValidator {
  return async function validateSpan(
    span: Pick<Span<SpanType.Prompt>, 'id' | 'traceId'>,
  ) {
    const spanhash = hashSpan(span)
    if (seenSpans.has(spanhash)) return null

    const gettingmd = await metadatasRepository.get<SpanType.Prompt>({
      traceId: span.traceId,
      spanId: span.id,
    })
    if (gettingmd.error) return null
    const metadata = gettingmd.value

    if (!metadata) return null

    const { hash, keyhash } = hashObject(metadata.parameters ?? {})
    if (keyhash !== parametersHash) return null
    if (seenParameters.has(hash)) return null

    seenSpans.add(spanhash)
    seenParameters.add(hash)
    return { ...span, metadata } as SpanWithDetails<SpanType.Prompt>
  }
}

async function getNegativeExamples({
  trackedIssues,
  otherIssues,
  evaluation,
  evaluations,
  document,
  validateSpan,
  baselineCommit,
  optimization,
  workspace,
  abortSignal,
}: {
  trackedIssues: Issue[]
  otherIssues: Issue[]
  evaluation: EvaluationV2
  evaluations: EvaluationV2[]
  document: DocumentVersion
  validateSpan: SpanValidator
  baselineCommit: Commit
  optimization: Optimization
  workspace: Workspace
  abortSignal?: AbortSignal
}) {
  const halfLimit = Math.floor((optimization.configuration.dataset?.target ?? OPTIMIZATION_MAX_ROWS ) / 2) // prettier-ignore
  const maxSearches = Math.ceil(halfLimit / SPANS_BATCH_SIZE) * SPANS_MAX_SEARCH // prettier-ignore

  const result: Record<string, SpanWithDetails<SpanType.Prompt>[]> = {}

  async function collectSpansByIssue(issue: Issue, target: number) {
    const validSpans: SpanWithDetails<SpanType.Prompt>[] = []
    let cursor: Cursor<string, string> | null = null
    let searches = 0

    while (validSpans.length < target && searches < maxSearches) {
      raiseForAborted(abortSignal)

      searches++

      const gettingsp = await getSpansByIssueForOptimization({
        issue: issue,
        spanTypes: [SpanType.Prompt],
        commit: baselineCommit,
        workspace: workspace,
        cursor,
        limit: SPANS_BATCH_SIZE,
      })
      if (gettingsp.error) break
      const { spans, next } = gettingsp.value

      if (spans.length === 0) break

      for (const span of spans) {
        if (validSpans.length >= target) break
        const validated = await validateSpan(span)
        if (validated) validSpans.push(validated)
      }

      if (!next) break
      cursor = next
    }

    return validSpans
  }

  async function collectSpansByEvaluation(evalUuid: string, target: number) {
    const validSpans: SpanWithDetails<SpanType.Prompt>[] = []
    let cursor: Cursor<Date, number> | null = null
    let searches = 0

    while (validSpans.length < target && searches < maxSearches) {
      raiseForAborted(abortSignal)

      searches++

      const gettingsp = await getSpansByEvaluation({
        evaluationUuid: evalUuid,
        passed: false,
        spanTypes: [SpanType.Prompt],
        commit: baselineCommit,
        document: document,
        workspace: workspace,
        cursor: cursor,
        limit: SPANS_BATCH_SIZE,
      })
      if (gettingsp.error) break
      const { spans: rawSpans, next } = gettingsp.value

      if (rawSpans.length === 0) break
      const spans = rawSpans as Span<SpanType.Prompt>[]

      for (const span of spans) {
        if (validSpans.length >= target) break
        const validated = await validateSpan(span)
        if (validated) validSpans.push(validated)
      }

      if (!next) break
      cursor = next
    }

    return validSpans
  }

  let collected = 0
  function addSpans(key: string, spans: SpanWithDetails<SpanType.Prompt>[]) {
    if (spans.length > 0) {
      result[key] = [...(result[key] ?? []), ...spans]
      collected += spans.length
    }
  }

  // -- Issue-based collection (round-robin) --
  const capableIssues = new Set<number>()
  async function issueRoundRobin(issues: Issue[]) {
    const deficit = halfLimit - collected

    for (const issue of issues) {
      raiseForAborted(abortSignal)

      if (collected >= halfLimit) break

      const part = Math.ceil(deficit / issues.length)
      const remaining = halfLimit - collected
      const target = Math.max(0, Math.min(part, remaining))
      if (target < 1) continue

      const spans = await collectSpansByIssue(issue, target)
      addSpans(String(issue.id), spans)

      if (spans.length >= target) {
        capableIssues.add(issue.id)
      } else {
        capableIssues.delete(issue.id)
      }
    }
  }

  // -- Evaluation-based collection (round-robin) --
  const capableEvals = new Set<string>()
  async function evaluationRoundRobin(evalUuids: string[]) {
    const deficit = halfLimit - collected

    for (const evalUuid of evalUuids) {
      raiseForAborted(abortSignal)

      if (collected >= halfLimit) break

      const part = Math.ceil(deficit / evalUuids.length)
      const remaining = halfLimit - collected
      const target = Math.max(0, Math.min(part, remaining))
      if (target < 1) continue

      const spans = await collectSpansByEvaluation(evalUuid, target)
      addSpans(evalUuid, spans)

      if (spans.length >= target) {
        capableEvals.add(evalUuid)
      } else {
        capableEvals.delete(evalUuid)
      }
    }
  }

  if (trackedIssues.length > 0) {
    // Tier 1: Tracked issues (round-robin with retry)
    await issueRoundRobin(trackedIssues)

    while (collected < halfLimit) {
      raiseForAborted(abortSignal)

      if (capableIssues.size === 0) break
      const retriedIssues = Array.from(capableIssues).map(
        (id) => trackedIssues.find((i) => i.id === id)!,
      )
      await issueRoundRobin(retriedIssues)
    }

    // Tier 2: Other issues (round-robin with retry)
    if (collected < halfLimit) {
      await issueRoundRobin(otherIssues)

      while (collected < halfLimit) {
        raiseForAborted(abortSignal)

        if (capableIssues.size === 0) break
        const retriedIssues = Array.from(capableIssues).map(
          (id) => otherIssues.find((i) => i.id === id)!,
        )
        await issueRoundRobin(retriedIssues)
      }
    }
  }

  // Tier 3 (or 1 if no linked issues): Failed results from the selected evaluation (trivial round-robin)
  if (collected < halfLimit) {
    await evaluationRoundRobin([evaluation.uuid])
  }

  // Tier 4 (or 2 if no linked issues): Failed results from all document evaluations (round-robin with retry)
  if (collected < halfLimit) {
    const otherEvalUuids = evaluations
      .filter((e) => e.uuid !== evaluation.uuid)
      .map((e) => e.uuid)

    if (otherEvalUuids.length > 0) {
      await evaluationRoundRobin(otherEvalUuids)

      while (collected < halfLimit) {
        raiseForAborted(abortSignal)

        if (capableEvals.size === 0) break
        const retriedEvals = Array.from(capableEvals)
        await evaluationRoundRobin(retriedEvals)
      }
    }
  }

  return Result.ok(result)
}

async function getPositiveExamples({
  validateSpan,
  document,
  baselineCommit,
  optimization,
  workspace,
  abortSignal,
}: {
  validateSpan: SpanValidator
  baselineCommit: Commit
  document: DocumentVersion
  optimization: Optimization
  workspace: Workspace
  abortSignal?: AbortSignal
}) {
  const halfLimit = Math.floor((optimization.configuration.dataset?.target ?? OPTIMIZATION_MAX_ROWS ) / 2) // prettier-ignore
  const maxSearches = Math.ceil(halfLimit / SPANS_BATCH_SIZE) * SPANS_MAX_SEARCH // prettier-ignore

  const result: SpanWithDetails<SpanType.Prompt>[] = []

  async function collectPositiveSpans({
    excludeFailedResults,
    requirePassedResults,
    requirePassedAnnotations,
  }: {
    excludeFailedResults: boolean
    requirePassedResults: boolean
    requirePassedAnnotations: boolean
  }) {
    let cursor: Cursor<Date, string> | null = null
    let searches = 0

    while (result.length < halfLimit && searches < maxSearches) {
      raiseForAborted(abortSignal)

      searches++

      const gettingsp = await getSpansWithoutIssues({
        excludeFailedResults,
        requirePassedResults,
        requirePassedAnnotations,
        spanTypes: [SpanType.Prompt],
        commit: baselineCommit,
        document: document,
        workspace: workspace,
        cursor: cursor,
        limit: SPANS_BATCH_SIZE,
      })
      if (gettingsp.error) break
      const { spans: rawSpans, next } = gettingsp.value

      if (rawSpans.length === 0) break
      const spans = rawSpans as Span<SpanType.Prompt>[]

      for (const span of spans) {
        if (result.length >= halfLimit) break

        const validated = await validateSpan(span)
        if (validated) result.push(validated)
      }

      if (!next) break
      cursor = next
    }
  }

  // Tier 1: Spans with passed human annotations, excluding failed results
  await collectPositiveSpans({
    excludeFailedResults: true,
    requirePassedResults: true,
    requirePassedAnnotations: true,
  })

  // Tier 2: Spans with any passed result, excluding failed results
  if (result.length < halfLimit) {
    await collectPositiveSpans({
      excludeFailedResults: true,
      requirePassedResults: true,
      requirePassedAnnotations: false,
    })
  }

  // Tier 3: Spans without failed results (no passed requirement)
  if (result.length < halfLimit) {
    await collectPositiveSpans({
      excludeFailedResults: true,
      requirePassedResults: false,
      requirePassedAnnotations: false,
    })
  }

  // Tier 4: Any span without issues (last resort)
  if (result.length < halfLimit) {
    await collectPositiveSpans({
      excludeFailedResults: false,
      requirePassedResults: false,
      requirePassedAnnotations: false,
    })
  }

  return Result.ok(result)
}

async function getExamples({
  negatives,
  positives,
  validateSpan,
  baselineCommit,
  document,
  optimization,
  workspace,
  abortSignal,
}: {
  negatives: Record<string, SpanWithDetails<SpanType.Prompt>[]>
  positives: SpanWithDetails<SpanType.Prompt>[]
  validateSpan: SpanValidator
  baselineCommit: Commit
  document: DocumentVersion
  optimization: Optimization
  workspace: Workspace
  abortSignal?: AbortSignal
}) {
  const halfLimit = Math.floor((optimization.configuration.dataset?.target ?? OPTIMIZATION_MAX_ROWS ) / 2) // prettier-ignore
  const maxSearches = Math.ceil(halfLimit / SPANS_BATCH_SIZE) * SPANS_MAX_SEARCH // prettier-ignore

  let negativesLength = 0
  for (const list of Object.values(negatives)) {
    negativesLength += list.length
  }

  const negativeNeeded = Math.max(0, halfLimit - negativesLength)
  const positiveNeeded = Math.max(0, halfLimit - positives.length)

  if (negativeNeeded <= 0 && positiveNeeded <= 0) {
    return Result.ok({ negatives, positives })
  }

  const additionalNegatives: SpanWithDetails<SpanType.Prompt>[] = []
  const additionalPositives: SpanWithDetails<SpanType.Prompt>[] = []

  let cursor: Cursor<Date, string> | null = null
  let searches = 0

  while (
    (additionalNegatives.length < negativeNeeded ||
      additionalPositives.length < positiveNeeded) &&
    searches < maxSearches
  ) {
    raiseForAborted(abortSignal)

    searches++

    const gettingsp = await getSpansByDocument({
      spanTypes: [SpanType.Prompt],
      commit: baselineCommit,
      document: document,
      workspace: workspace,
      cursor: cursor,
      limit: SPANS_BATCH_SIZE,
    })
    if (gettingsp.error) break
    const { spans: rawSpans, next } = gettingsp.value

    if (rawSpans.length === 0) break
    const spans = rawSpans as Span<SpanType.Prompt>[]

    for (const span of spans) {
      if (
        additionalNegatives.length >= negativeNeeded &&
        additionalPositives.length >= positiveNeeded
      ) {
        break
      }

      const validated = await validateSpan(span)
      if (!validated) continue

      const negRemaining = negativeNeeded - additionalNegatives.length
      const posRemaining = positiveNeeded - additionalPositives.length

      if (negRemaining >= posRemaining) {
        additionalNegatives.push(validated)
      } else {
        additionalPositives.push(validated)
      }
    }

    if (!next) break
    cursor = next
  }

  if (additionalNegatives.length > 0) {
    negatives['__fallback__'] = additionalNegatives
  }

  if (additionalPositives.length > 0) {
    positives = [...positives, ...additionalPositives]
  }

  return Result.ok({ negatives, positives })
}

async function buildDatasetColumns({
  parameters,
  optimization,
}: {
  parameters: string[]
  optimization: Optimization
}) {
  const columns: Record<string, Column> = {}

  for (const parameter of parameters) {
    const column =
      optimization.configuration.parameters?.[parameter]?.column ?? parameter

    columns[parameter] = buildColumns({
      newColumns: [{ name: column }],
      prevColumns: [],
      hashAlgorithm: nanoidHashAlgorithm,
    })[0]!
  }

  return Result.ok(columns)
}

async function buildDatasetRows({
  parameters,
  examples,
  columns,
  optimization: { configuration },
  maskPii = false,
}: {
  parameters: string[]
  examples: SpanWithDetails<SpanType.Prompt>[]
  columns: Record<string, Column>
  optimization: Optimization
  maskPii?: boolean
}) {
  const rows = []
  for (const example of examples) {
    const row: DatasetRowData = {}
    for (const parameter of parameters) {
      let value = example.metadata?.parameters?.[parameter]

      if (maskPii && configuration.parameters?.[parameter]?.isPii) {
        value = maskParameter({ parameter, value, configuration })
      }

      row[columns[parameter].identifier] = value ?? undefined
    }
    rows.push(row)
  }

  return Result.ok(rows)
}

async function createDatasets(
  {
    parameters,
    negatives: negativesMap,
    positives,
    baselineCommit,
    optimization,
    workspace,
    abortSignal,
  }: {
    parameters: string[]
    negatives: Record<string, SpanWithDetails<SpanType.Prompt>[]>
    positives: SpanWithDetails<SpanType.Prompt>[]
    baselineCommit: Commit
    optimization: Optimization
    workspace: Workspace
    abortSignal?: AbortSignal
  },
  transaction = new Transaction(),
) {
  raiseForAborted(abortSignal)

  const halfLimit = Math.floor((optimization.configuration.dataset?.target ?? OPTIMIZATION_MAX_ROWS ) / 2) // prettier-ignore

  const negatives = interleaveList(negativesMap, halfLimit, true)
  positives = positives.sort(() => Math.random() - 0.5).slice(0, halfLimit)
  if (negatives.length + positives.length < OPTIMIZATION_MIN_ROWS) {
    return Result.error(
      new UnprocessableEntityError(
        `At least ${OPTIMIZATION_MIN_ROWS} different examples are required. ${negatives.length} negative and ${positives.length} positive examples curated so far`,
      ),
    )
  }

  const nSplit = Math.floor(negatives.length * OPTIMIZATION_TESTSET_SPLIT)
  const pSplit = Math.floor(positives.length * OPTIMIZATION_TESTSET_SPLIT)
  const mSplit = Math.floor(OPTIMIZATION_MAX_ROWS * OPTIMIZATION_TESTSET_SPLIT)

  // prettier-ignore
  const trainsplit = [...negatives.slice(0, nSplit), ...positives.slice(0, pSplit)]
    .sort(() => Math.random() - 0.5).slice(0, mSplit)

  // prettier-ignore
  const testsplit = [...negatives.slice(nSplit), ...positives.slice(pSplit)]
    .sort(() => Math.random() - 0.5).slice(0, OPTIMIZATION_MAX_ROWS - mSplit)

  const buildingco = await buildDatasetColumns({ parameters, optimization })
  if (buildingco.error) {
    return Result.error(buildingco.error)
  }
  const columns = buildingco.value

  const buildingtr = await buildDatasetRows({
    parameters: parameters,
    examples: trainsplit,
    columns: columns,
    optimization: optimization,
    maskPii: true,
  })
  if (buildingtr.error) {
    return Result.error(buildingtr.error)
  }
  const trainrows = buildingtr.value

  if (trainrows.length < 1) {
    return Result.error(
      new UnprocessableEntityError('Cannot optimize with an empty trainset'),
    )
  }

  const buildingte = await buildDatasetRows({
    parameters: parameters,
    examples: testsplit,
    columns: columns,
    optimization: optimization,
    maskPii: false, // Note: the testset must be untouched for validation
  })
  if (buildingte.error) {
    return Result.error(buildingte.error)
  }
  const testrows = buildingte.value

  if (testrows.length < 1) {
    return Result.error(
      new UnprocessableEntityError('Cannot optimize with an empty testset'),
    )
  }

  const finding = await findWorkspaceUserById({
    workspaceId: workspace.id,
    id: baselineCommit.userId,
  })
  if (finding.error) {
    return Result.error(finding.error)
  }
  const author = finding.value

  return await transaction.call(async () => {
    const creatingtr = await createDataset(
      {
        data: {
          name: `Trainset #${optimization.uuid.slice(0, 8)}`,
          columns: Object.values(columns),
        },
        author: author,
        workspace: workspace,
      },
      transaction,
    )
    if (creatingtr.error) {
      return Result.error(creatingtr.error)
    }
    const trainset = creatingtr.value

    const creatingte = await createDataset(
      {
        data: {
          name: `Testset #${optimization.uuid.slice(0, 8)}`,
          columns: Object.values(columns),
        },
        author: author,
        workspace: workspace,
      },
      transaction,
    )
    if (creatingte.error) {
      return Result.error(creatingte.error)
    }
    const testset = creatingte.value

    if (trainrows.length > 0) {
      const inserting = await insertRowsInBatch(
        { dataset: trainset, data: { rows: trainrows } },
        transaction,
      )
      if (inserting.error) {
        return Result.error(inserting.error)
      }
    }

    if (testrows.length > 0) {
      const inserting = await insertRowsInBatch(
        { dataset: testset, data: { rows: testrows } },
        transaction,
      )
      if (inserting.error) {
        return Result.error(inserting.error)
      }
    }

    return Result.ok({ trainset, testset })
  })
}

function hashSpan(span: Pick<Span<SpanType.Prompt>, 'id' | 'traceId'>) {
  return `${span.traceId}:${span.id}`
}
