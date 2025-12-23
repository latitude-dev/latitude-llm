import { and, eq } from 'drizzle-orm'
import { scan } from 'promptl-ai'
import {
  EvaluationType,
  EvaluationV2,
  OPTIMIZATION_DATASET_ROWS,
  OPTIMIZATION_DATASET_SPLIT,
  Span,
  SpanType,
  SpanWithDetails,
} from '../../constants'
import { getSpansByIssue } from '../../data-access/issues/getSpansByIssue'
import { getSpansWithoutIssues } from '../../data-access/issues/getSpansWithoutIssues'
import { publisher } from '../../events/publisher'
import { executeOptimizationJobKey } from '../../jobs/job-definitions/optimizations/executeOptimizationJob'
import { queues } from '../../jobs/queues'
import { NotFoundError, UnprocessableEntityError } from '../../lib/errors'
import { hashContent } from '../../lib/hashContent'
import { interleaveList } from '../../lib/interleaveList'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  CommitsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  IssuesRepository,
  ProjectsRepository,
  SpanMetadatasRepository,
  UsersRepository,
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
import { maskParameter } from './shared'

export async function prepareOptimization(
  {
    optimization,
    workspace,
  }: {
    optimization: Optimization
    workspace: Workspace
    abortSignal?: AbortSignal // TODO(AO/OPT): Implement cancellation
  },
  transaction = new Transaction(),
) {
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
    const projectsRepository = new ProjectsRepository(workspace.id)
    const gettingpj = await projectsRepository.find(optimization.projectId)
    if (gettingpj.error) {
      return Result.error(gettingpj.error)
    }
    const project = gettingpj.value

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
    const { keyhash: parametersHash } = hashParameters(
      Object.fromEntries(parameters.entries()),
    )

    const seenSpans = new Set<string>()
    const seenParameters = new Set<string>()

    const gettingne = await getNegativeExamples({
      trackedIssues: issues.tracked,
      otherIssues: issues.other,
      parametersHash: parametersHash,
      seenSpans: seenSpans,
      seenParameters: seenParameters,
      baselineCommit: baselineCommit,
      optimization: optimization,
      workspace: workspace,
    })
    if (gettingne.error) {
      return Result.error(gettingne.error)
    }
    const negatives = gettingne.value

    const gettingpo = await getPositiveExamples({
      parametersHash: parametersHash,
      seenSpans: seenSpans,
      seenParameters: seenParameters,
      baselineCommit: baselineCommit,
      document: document,
      optimization: optimization,
      workspace: workspace,
    })
    if (gettingpo.error) {
      return Result.error(gettingpo.error)
    }
    const positives = gettingpo.value

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

function hashSpan(span: Span<SpanType.Prompt>) {
  return `${span.traceId}:${span.id}`
}

function hashParameters(parameters: Record<string, unknown>) {
  const keys = Object.keys(parameters).sort()
  const values = keys.map((key) => parameters[key])

  const keyhash = hashContent(JSON.stringify(keys))
  const valhash = hashContent(JSON.stringify(values))

  return { keyhash, valhash }
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
  const issuesRepository = new IssuesRepository(workspace.id)
  const issues = await issuesRepository.findActiveByDocument({
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

  return Result.ok({ tracked, other })
}

const SPANS_BATCH_SIZE = 100
const SPANS_MAX_SEARCH = 3 // Try to search at most 3 times to get enough spans

async function getNegativeExamples({
  trackedIssues,
  otherIssues,
  parametersHash,
  seenSpans,
  seenParameters,
  baselineCommit,
  workspace,
}: {
  trackedIssues: Issue[]
  otherIssues: Issue[]
  parametersHash: string
  seenSpans: Set<string>
  seenParameters: Set<string>
  baselineCommit: Commit
  optimization: Optimization
  workspace: Workspace
}) {
  const halfLimit = Math.floor(OPTIMIZATION_DATASET_ROWS / 2)
  const maxSearches = Math.floor(halfLimit / SPANS_BATCH_SIZE) * SPANS_MAX_SEARCH // prettier-ignore

  const metadatasRepository = new SpanMetadatasRepository(workspace.id)
  async function collectNegativeSpans(issue: Issue, target: number) {
    const validSpans: SpanWithDetails<SpanType.Prompt>[] = []
    let cursor: Cursor<Date, number> | null = null
    let searches = 0

    while (validSpans.length < target && searches < maxSearches) {
      searches++

      const gettingsp = await getSpansByIssue({
        issue: issue,
        includeExperiments: false, // Note: exclude experiments to not get duplicates from optimization runs
        commit: baselineCommit,
        workspace: workspace,
        cursor: cursor,
        limit: SPANS_BATCH_SIZE,
      })
      if (gettingsp.error) break
      const { spans, next } = gettingsp.value

      if (spans.length === 0) break

      for (const span of spans) {
        if (validSpans.length >= target) break

        const spanhash = hashSpan(span)
        if (seenSpans.has(spanhash)) continue

        const gettingmd = await metadatasRepository.get<SpanType.Prompt>({
          traceId: span.traceId,
          spanId: span.id,
        })
        if (gettingmd.error) continue
        const metadata = gettingmd.value

        if (!metadata) continue

        const { keyhash, valhash } = hashParameters(metadata.parameters ?? {})
        if (keyhash !== parametersHash) continue
        if (seenParameters.has(valhash)) continue

        seenSpans.add(spanhash)
        seenParameters.add(valhash)
        validSpans.push({ ...span, metadata })
      }

      if (!next) break
      cursor = next
    }

    return validSpans
  }

  let collected = 0
  const capableIssues = new Set<number>()
  const result: Record<number, SpanWithDetails<SpanType.Prompt>[]> = {}
  async function roundRobin(issues: Issue[]) {
    const deficit = halfLimit - collected

    for (const issue of issues) {
      if (collected >= halfLimit) break

      const part = Math.ceil(deficit / issues.length)
      const remaining = halfLimit - collected
      const target = Math.max(0, Math.min(part, remaining))
      if (target < 1) continue

      const spans = await collectNegativeSpans(issue, target)
      if (spans.length > 0) {
        result[issue.id] = [...(result[issue.id] ?? []), ...spans]
        collected += spans.length
      }

      if (spans.length >= target) {
        capableIssues.add(issue.id)
      } else {
        capableIssues.delete(issue.id)
      }
    }
  }

  await roundRobin(trackedIssues)

  while (collected < halfLimit) {
    if (capableIssues.size === 0) break

    const retriedIssues = Array.from(capableIssues).map(
      (id) => trackedIssues.find((i) => i.id === id)!,
    )
    await roundRobin(retriedIssues)
  }

  if (collected < halfLimit) {
    await roundRobin(otherIssues)
  }

  return Result.ok(result)
}

async function getPositiveExamples({
  parametersHash,
  seenSpans,
  seenParameters,
  document,
  baselineCommit,
  workspace,
}: {
  parametersHash: string
  seenSpans: Set<string>
  seenParameters: Set<string>
  baselineCommit: Commit
  document: DocumentVersion
  optimization: Optimization
  workspace: Workspace
}) {
  const halfLimit = Math.floor(OPTIMIZATION_DATASET_ROWS / 2)
  const maxSearches = Math.floor(halfLimit / SPANS_BATCH_SIZE) * SPANS_MAX_SEARCH // prettier-ignore

  const metadatasRepository = new SpanMetadatasRepository(workspace.id)
  const result: SpanWithDetails<SpanType.Prompt>[] = []
  let cursor: Cursor<Date, string> | null = null
  let searches = 0

  while (result.length < halfLimit && searches < maxSearches) {
    searches++

    const gettingsp = await getSpansWithoutIssues({
      includeExperiments: false, // Note: exclude experiments to not get duplicates from optimization runs
      commit: baselineCommit,
      document: document,
      workspace: workspace,
      cursor: cursor,
      limit: SPANS_BATCH_SIZE,
    })
    if (gettingsp.error) break
    const { spans, next } = gettingsp.value

    if (spans.length === 0) break

    for (const span of spans) {
      if (result.length >= halfLimit) break

      const spanhash = hashSpan(span)
      if (seenSpans.has(spanhash)) continue

      const gettingmd = await metadatasRepository.get<SpanType.Prompt>({
        traceId: span.traceId,
        spanId: span.id,
      })
      if (gettingmd.error) continue
      const metadata = gettingmd.value

      if (!metadata) continue

      const { keyhash, valhash } = hashParameters(metadata.parameters ?? {})
      if (keyhash !== parametersHash) continue
      if (seenParameters.has(valhash)) continue

      seenSpans.add(spanhash)
      seenParameters.add(valhash)
      result.push({ ...span, metadata })
    }

    if (!next) break
    cursor = next
  }

  return Result.ok(result)
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
  }: {
    parameters: string[]
    negatives: Record<number, SpanWithDetails<SpanType.Prompt>[]>
    positives: SpanWithDetails<SpanType.Prompt>[]
    baselineCommit: Commit
    optimization: Optimization
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  let negativesLength = 0
  for (const list of Object.values(negativesMap)) {
    negativesLength += list.length
  }

  const halfLimit = Math.floor(
    Math.min(negativesLength, positives.length, OPTIMIZATION_DATASET_ROWS / 2),
  )
  const split = Math.floor(halfLimit * OPTIMIZATION_DATASET_SPLIT)

  const negatives = interleaveList(negativesMap, halfLimit, true)
  positives = [...positives].sort(() => Math.random() - 0.5).slice(0, halfLimit)

  // prettier-ignore
  const trainsplit = [
    ...negatives.slice(0, split),
    ...positives.slice(0, split),
  ].sort(() => Math.random() - 0.5)

  // prettier-ignore
  const testsplit = [
    ...negatives.slice(split),
    ...positives.slice(split),
  ].sort(() => Math.random() - 0.5)

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

  const userRepository = new UsersRepository(workspace.id)
  const finding = await userRepository.find(baselineCommit.userId)
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
