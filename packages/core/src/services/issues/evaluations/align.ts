import {
  EVALUATION_ALIGNMENT_BUDGET_TIME,
  EVALUATION_ALIGNMENT_BUDGET_TOKENS,
  EVALUATION_ALIGNMENT_DATASET_CONVO,
  EVALUATION_ALIGNMENT_DATASET_LABEL,
  EVALUATION_ALIGNMENT_DATASET_REASON,
  EVALUATION_ALIGNMENT_MAX_ANNOTATIONS,
  EVALUATION_ALIGNMENT_VALSET_SPLIT,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  MAIN_SPAN_TYPES,
  MainSpanType,
  OptimizationEngine,
  RuleEvaluationMetric,
  Span,
} from '../../../constants'
import { publisher } from '../../../events/publisher'
import { formatConversation } from '../../../helpers'
import { UnprocessableEntityError } from '../../../lib/errors'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { raiseForAborted } from '../../../lib/raiseForAborted'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { getSpansByIssueForOptimization } from '../../../queries/issues/getSpansByIssueForOptimization'
import { getSpansWithoutIssues } from '../../../queries/issues/getSpansWithoutIssues'
import { DocumentVersionsRepository } from '../../../repositories'
import { Commit } from '../../../schema/models/types/Commit'
import { Dataset } from '../../../schema/models/types/Dataset'
import { DatasetRow } from '../../../schema/models/types/DatasetRow'
import { Issue } from '../../../schema/models/types/Issue'
import { Optimization } from '../../../schema/models/types/Optimization'
import {
  WorkspaceDto,
  type Workspace,
} from '../../../schema/models/types/Workspace'
import { scanDocumentContent } from '../../documents'
import { createEvaluationV2 } from '../../evaluationsV2/create'
import { updateEvaluationV2 } from '../../evaluationsV2/update'
import {
  OPTIMIZATION_ENGINES,
  evaluateFactory,
  proposeFactory,
} from '../../optimizations/optimizers'
import { assembleTraceWithMessages } from '../../tracing/traces/assemble'
import { isIssueActive } from '../shared'

export async function alignIssueEvaluation(
  {
    issue,
    evaluation,
    provider,
    model,
    commit,
    workspace,
    abortSignal,
  }: {
    issue: Issue
    evaluation?: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Custom>
    provider?: string
    model?: string
    commit: Commit
    workspace: Workspace
    abortSignal?: AbortSignal
  },
  transaction = new Transaction(),
) {
  raiseForAborted(abortSignal)

  if (!isIssueActive(issue)) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot align an evaluation for an inactive issue',
      ),
    )
  }

  if (evaluation && evaluation.issueId !== issue.id) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot realign an evaluation for a different issue',
      ),
    )
  }

  const documentsRepository = new DocumentVersionsRepository(workspace.id)
  const gettingdo = await documentsRepository.getDocumentAtCommit({
    commitUuid: commit.uuid,
    documentUuid: issue.documentUuid,
  })
  if (gettingdo.error) {
    return Result.error(gettingdo.error)
  }
  const document = gettingdo.value

  let prompt
  if (evaluation) {
    prompt = evaluation.configuration.prompt
  } else if (provider && model) {
    prompt = EVALUATION_ALIGNMENT_TEMPLATE({ issue, provider, model })
  } else {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot align an evaluation without a provider or model',
      ),
    )
  }

  const alignment = EVALUATION_ALIGNMENT_METRIC({ issue, commit, workspace })

  const [trainset, valset] = EVALUATION_ALIGNMENT_DATASETS({ workspace })

  const optimization = EVALUATION_ALIGNMENT_OPTIMIZATION({
    issue: issue,
    alignment: alignment,
    prompt: prompt,
    trainset: trainset,
    valset: valset,
    commit: commit,
    workspace: workspace,
  })

  const halfLimit = Math.floor(EVALUATION_ALIGNMENT_MAX_ANNOTATIONS / 2)

  const gettingns = await getSpansByIssueForOptimization({
    issue: issue,
    requireFailedAnnotations: true,
    spanTypes: [...MAIN_SPAN_TYPES],
    commit: commit,
    workspace: workspace,
    limit: halfLimit,
  })
  if (gettingns.error) {
    return Result.error(gettingns.error)
  }
  const negatives = gettingns.value.spans

  const gettingps = await getSpansWithoutIssues({
    excludeFailedResults: true,
    requirePassedResults: true,
    requirePassedAnnotations: true,
    spanTypes: [...MAIN_SPAN_TYPES],
    commit: commit,
    document: document,
    workspace: workspace,
    limit: halfLimit,
  })
  if (gettingps.error) {
    return Result.error(gettingps.error)
  }
  const positives = gettingps.value.spans

  const spans: Span<MainSpanType>[] = []
  for (const span of [...negatives, ...positives]) {
    if (spans.find((s) => s.traceId === span.traceId && s.id === span.id)) {
      continue
    }
    spans.push(span)
  }

  let rows = await Promise.all(
    spans.map((span) => buildRow({ span, workspace }).then((r) => r.unwrap())),
  )
  rows = rows.sort(() => Math.random() - 0.5)

  const split = Math.floor(rows.length * EVALUATION_ALIGNMENT_VALSET_SPLIT)
  const trainrows = rows.slice(0, split).map((r) => ({...r, datasetId: trainset.id})) // prettier-ignore
  const valrows = rows.slice(split).map((r) => ({...r, datasetId: valset.id})) // prettier-ignore

  const optimize = OPTIMIZATION_ENGINES[optimization.engine]
  if (!optimize) {
    return Result.error(
      new UnprocessableEntityError(
        `Cannot execute an optimization with unknown engine: ${optimization.engine}`,
      ),
    )
  }

  raiseForAborted(abortSignal)

  const optimizing = await optimize({
    evaluate: await evaluateFactory({
      evaluation: alignment,
      trainset: trainset,
      valset: valset,
      optimization: optimization,
      document: document,
      commit: commit,
      workspace: workspace as WorkspaceDto,
      dry: true,
    }),
    propose: await proposeFactory({
      optimization: optimization,
      document: document,
      commit: commit,
      workspace: workspace,
    }),
    evaluation: alignment,
    trainset: trainrows,
    valset: valrows,
    optimization: optimization,
    document: document,
    commit: commit,
    workspace: workspace,
    abortSignal: abortSignal,
  })
  if (optimizing.error) {
    return Result.error(optimizing.error)
  }
  const optimizedPrompt = optimizing.value

  const scanning = await scanDocumentContent({
    document: { ...document, content: optimizedPrompt },
    commit: commit,
  })
  if (scanning.error) {
    return Result.error(scanning.error)
  } else if (scanning.value.errors.length > 0) {
    return Result.error(
      new UnprocessableEntityError('Optimized prompt has errors'),
    )
  }

  return await transaction.call(
    async (tx) => {
      if (evaluation) {
        evaluation = await updateEvaluationV2(
          {
            evaluation: evaluation,
            commit: commit,
            workspace: workspace,
            settings: {
              configuration: {
                ...evaluation.configuration,
                prompt: optimizedPrompt,
              },
            },
            issueId: issue.id,
            alignmentMetricMetadata: undefined, // TODO(issues/evaluations): add alignment metric metadata
            force: true,
          },
          transaction,
        ).then((r) => r.unwrap().evaluation)
      } else {
        evaluation = await createEvaluationV2({
          document: document,
          commit: commit,
          settings: {
            name: `Generated #${optimization.uuid.slice(0, 8)}`, // TODO(issues/evaluations): generate evaluation name
            description: `Monitors issue: ${issue.title}`,
            type: EvaluationType.Llm,
            metric: LlmEvaluationMetric.Custom,
            configuration: {
              reverseScale: false,
              actualOutput: {
                messageSelection: 'last',
                parsingFormat: 'string',
              },
              trigger: {
                target: 'every',
              },
              provider: provider!,
              model: model!,
              prompt: optimizedPrompt,
              minScore: 0,
              maxScore: 1,
              minThreshold: 1,
            },
          },
          options: {
            evaluateLiveLogs: true,
          },
          issueId: issue.id,
          alignmentMetricMetadata: undefined, // TODO(issues/evaluations): add alignment metric metadata
          workspace: workspace,
        }).then((r) => r.unwrap().evaluation)
      }

      return Result.ok({ evaluation })
    },
    async ({ evaluation }) => {
      // TODO(issues/evaluations): send correct event
      const payload = {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      }

      await publisher.publishLater({
        type: 'optimizationExecuted',
        data: payload,
      })
    },
  )
}

async function buildRow({
  span,
  workspace,
}: {
  span: Span<MainSpanType>
  workspace: Workspace
}) {
  const now = new Date()

  const assembling = await assembleTraceWithMessages({
    traceId: span.traceId,
    spanId: span.id,
    workspace: workspace,
  })
  if (assembling.error) {
    return Result.error(assembling.error)
  }

  const { completionSpan: completion } = assembling.value
  if (!completion?.metadata) {
    return Result.error(
      new UnprocessableEntityError('Could not find conversation in span'),
    )
  }

  const conversation = formatConversation([
    ...completion.metadata.input,
    ...(completion.metadata.output ?? []),
  ])

  return Result.ok<DatasetRow>({
    id: 0,
    workspaceId: workspace.id,
    datasetId: 0,
    rowData: {
      [EVALUATION_ALIGNMENT_DATASET_CONVO]: conversation,
      [EVALUATION_ALIGNMENT_DATASET_LABEL]: 0, // TODO(issues/evaluations): add label from annotation
      [EVALUATION_ALIGNMENT_DATASET_REASON]: '', // TODO(issues/evaluations): add reason from annotation
    },
    createdAt: now,
    updatedAt: now,
  })
}

const EVALUATION_ALIGNMENT_METRIC = ({
  issue,
  commit,
  workspace,
}: {
  issue: Issue
  commit: Commit
  workspace: Workspace
}) => {
  const now = new Date()
  const uuid = generateUUIDIdentifier()
  return {
    id: 0,
    versionId: 0,
    uuid: uuid,
    evaluationUuid: uuid,
    workspaceId: workspace.id,
    commitId: commit.id,
    documentUuid: issue.documentUuid,
    name: `Alignment #${uuid.slice(0, 8)}`,
    description: 'Temporary system-created evaluation',
    type: EvaluationType.Rule,
    metric: RuleEvaluationMetric.ExactMatch,
    configuration: {
      reverseScale: false,
      actualOutput: {
        messageSelection: 'last',
        contentFilter: 'text',
        parsingFormat: 'json',
        fieldAccessor: 'score',
      },
      caseInsensitive: false,
    },
    createdAt: now,
    updatedAt: now,
  } as EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>
}

const EVALUATION_ALIGNMENT_TEMPLATE = ({
  issue,
  provider,
  model,
}: {
  issue: Issue
  provider: string
  model: string
}) =>
  `
---
provider: ${provider}
model: ${model}
---

You're an expert LLM-as-a-judge evaluator and monitor of active issues.
Your task is to judge whether the conversation, from another LLM model (the assistant), contains the following issue:
\`\`\`
# ${issue.title}
${issue.description}
\`\`\`

You must give your verdict as a single JSON object with the following properties:
- score (number):
  - \`0\` if the conversation DOES CONTAIN the issue (the test fails).
  - \`1\` if the conversation DOES NOT CONTAIN the issue (the test passes).
- reason (string): A string explaining your evaluation decision.

Important:
- The verdict you are asked to produce is YOUR output as an evaluator.
- Do not factor it into your assessment of the assistant's response.
- The assistant being evaluated is not expected to produce a verdict or follow your output format.

<user>
  Based on the given instructions, evaluate the conversation:
  \`\`\`
  {{ conversation }}
  \`\`\`
</user>
`.trim()

const EVALUATION_ALIGNMENT_DATASETS = ({
  workspace,
}: {
  workspace: Workspace
}) => {
  const now = new Date()
  const uuid = generateUUIDIdentifier()
  const dataset = {
    workspaceId: workspace.id,
    tags: [],
    columns: [
      {
        identifier: EVALUATION_ALIGNMENT_DATASET_CONVO,
        name: EVALUATION_ALIGNMENT_DATASET_CONVO,
        role: 'parameter',
      },
      {
        identifier: EVALUATION_ALIGNMENT_DATASET_LABEL,
        name: EVALUATION_ALIGNMENT_DATASET_LABEL,
        role: 'label',
      },
      {
        identifier: EVALUATION_ALIGNMENT_DATASET_REASON,
        name: EVALUATION_ALIGNMENT_DATASET_REASON,
        role: 'metadata',
      },
    ],
    deletedAt: null,
    authorId: null,
    createdAt: now,
    updatedAt: now,
  }
  return [
    {
      id: 0,
      name: `Trainset #${uuid.slice(0, 8)}`,
      ...dataset,
    },
    {
      id: 1,
      name: `Valset #${uuid.slice(0, 8)}`,
      ...dataset,
    },
  ] as [Dataset, Dataset]
}

const EVALUATION_ALIGNMENT_OPTIMIZATION = ({
  issue,
  alignment,
  prompt,
  trainset,
  valset,
  commit,
  workspace,
}: {
  issue: Issue
  alignment: EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>
  prompt: string
  trainset: Dataset
  valset: Dataset
  commit: Commit
  workspace: Workspace
}) => {
  const now = new Date()
  const uuid = generateUUIDIdentifier()
  return {
    id: 0,
    uuid: uuid,
    workspaceId: workspace.id,
    projectId: issue.projectId,
    documentUuid: issue.documentUuid,
    baselineCommitId: commit.id,
    baselinePrompt: prompt,
    evaluationUuid: alignment.uuid,
    engine: OptimizationEngine.Gepa,
    configuration: {
      dataset: {
        label: EVALUATION_ALIGNMENT_DATASET_LABEL,
        reason: EVALUATION_ALIGNMENT_DATASET_REASON,
      },
      scope: {
        configuration: true,
        instructions: true,
      },
      budget: {
        time: EVALUATION_ALIGNMENT_BUDGET_TIME,
        tokens: EVALUATION_ALIGNMENT_BUDGET_TOKENS,
      },
    },
    trainsetId: trainset.id,
    testsetId: valset.id,
    createdAt: now,
    updatedAt: now,
    preparedAt: now,
  } as Optimization
}
