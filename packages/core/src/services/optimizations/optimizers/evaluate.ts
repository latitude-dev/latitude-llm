import { Message } from '@latitude-data/constants/messages'
import {
  MAX_SIMULATION_TURNS,
  SimulationSettings,
} from '@latitude-data/constants/simulation'
import { database } from '../../../client'
import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  EvaluationV2,
  isMainSpan,
  LogSources,
  MainSpanType,
  Span,
  SpanMetadata,
  SpanWithDetails,
} from '../../../constants'
import { AbortedError, UnprocessableEntityError } from '../../../lib/errors'
import { hashContent } from '../../../lib/hashContent'
import { hashObject } from '../../../lib/hashObject'
import { isAbortError } from '../../../lib/isAbortError'
import { isRetryableError } from '../../../lib/isRetryableError'
import { Result } from '../../../lib/Result'
import {
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../repositories/spansRepository'
import { Column } from '../../../schema/models/datasets'
import { Commit } from '../../../schema/models/types/Commit'
import { DatasetRow } from '../../../schema/models/types/DatasetRow'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Optimization } from '../../../schema/models/types/Optimization'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import { BACKGROUND } from '../../../telemetry'
import { runDocumentAtCommit } from '../../commits/runDocumentAtCommit'
import { scanDocumentContent } from '../../documents'
import { addMessages } from '../../documentLogs/addMessages'
import { runEvaluationV2 } from '../../evaluationsV2/run'
import {
  getTriggerTarget,
  selectSpansForTrigger,
} from '../../evaluationsV2/triggers'
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'
import { generateSimulatedUserAction } from '../../simulation/simulateUserResponse'
import { OptimizerEvaluateArgs } from './index'
import { LearnableTrajectory } from './shared'

// BONUS(AO/OPT): Implement multi-objective optimization
// BONUS(AO/OPT): Implement multi-document optimization
export async function evaluateFactory<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  columns,
  evaluation,
  optimization,
  document,
  commit,
  workspace,
}: {
  columns: (Column & { datasetId: number })[]
  evaluation: EvaluationV2<T, M>
  optimization: Optimization
  document: DocumentVersion
  commit: Commit
  workspace: WorkspaceDto
}) {
  const {
    parameters: baselineParameters,
    config: baselineConfiguration,
    instructions: baselineInstructions,
  } = await scanDocumentContent({
    document: { ...document, content: optimization.baselinePrompt },
    commit: commit,
  }).then((r) => r.unwrap())

  return async function (
    { prompt, example, abortSignal }: OptimizerEvaluateArgs, // TODO(AO/OPT): Implement cancellation
    db = database,
  ) {
    const validating = await validatePrompt(
      {
        prompt: prompt,
        example: example,
        baseline: {
          parameters: baselineParameters,
          configuration: baselineConfiguration,
          instructions: baselineInstructions,
        },
        optimization: optimization,
        document: document,
        commit: commit,
        workspace: workspace,
        abortSignal: abortSignal,
      },
      db,
    )
    if (validating.error) {
      return Result.error(validating.error)
    } else if ('_tjr' in validating.value) {
      return Result.ok(validating.value)
    }
    const { parameters } = validating.value

    const running = await runPrompt(
      {
        prompt: prompt,
        example: example,
        parameters: parameters,
        columns: columns,
        optimization: optimization,
        document: document,
        commit: commit,
        workspace: workspace,
        abortSignal: abortSignal,
      },
      db,
    )
    if (running.error) {
      return Result.error(running.error)
    } else if ('_tjr' in running.value) {
      return Result.ok(running.value)
    }
    const { uuid, messages, duration, usage, turnsExecuted } = running.value

    const waiting = await waitForMainSpans({
      logUuid: uuid,
      expectedCount: turnsExecuted,
      workspace: workspace,
      abortSignal: abortSignal,
    })
    if (waiting.error) {
      return Result.error(waiting.error)
    }

    const triggerTarget = getTriggerTarget(evaluation.configuration.trigger)
    const selectedSpans = selectSpansForTrigger(waiting.value, triggerTarget)

    const evaluationResults: {
      score: number
      feedback: string
      passed: boolean
    }[] = []
    for (const rawSpan of selectedSpans) {
      const enriching = await enrichSpanWithMetadata(rawSpan, workspace)
      if (enriching.error) {
        return Result.error(enriching.error)
      }

      const evaluating = await evaluatePrompt(
        {
          prompt: prompt,
          example: example,
          span: enriching.value,
          evaluation: evaluation,
          optimization: optimization,
          document: document,
          commit: commit,
          workspace: workspace,
          abortSignal: abortSignal,
        },
        db,
      )
      if (evaluating.error) {
        return Result.error(evaluating.error)
      }

      evaluationResults.push(evaluating.value)
    }

    const { score, feedback, passed } =
      aggregateEvaluationResults(evaluationResults)

    return Result.ok(
      LearnableTrajectory(example, {
        trace: messages,
        usage: usage, // BONUS(AO/OPT): Take into account evaluation usage
        duration: duration,
        score: score,
        feedback: feedback,
        passed: passed,
      }),
    )
  }
}

async function validatePrompt(
  {
    prompt,
    example,
    baseline,
    optimization,
    document,
    commit,
  }: {
    prompt: string
    example: DatasetRow
    baseline: {
      parameters: Set<string>
      configuration: Record<string, unknown>
      instructions: string
    }
    optimization: Optimization
    document: DocumentVersion
    commit: Commit
    workspace: WorkspaceDto
    abortSignal?: AbortSignal
  },
  _ = database,
) {
  const scanning = await scanDocumentContent({
    document: { ...document, content: prompt },
    commit: commit,
  })
  if (scanning.error) {
    return Result.error(scanning.error)
  } else if (scanning.value.errors.length > 0) {
    // Note: we treat prompt syntax errors as learnable
    let feedback = ''
    for (const error of scanning.value.errors) {
      feedback += error.toString() + '\n\n'
    }
    feedback = `
The optimized prompt has syntax errors:
${feedback}
`.trim()

    return Result.ok(LearnableTrajectory(example, { feedback }))
  }
  const { parameters, config: configuration, instructions } = scanning.value

  if (
    configuration.provider !== baseline.configuration.provider ||
    configuration.model !== baseline.configuration.model
  ) {
    const feedback = `
The optimized prompt must have the same provider and model as the baseline prompt.
The provider is: \`${baseline.configuration.provider}\` and the model is: \`${baseline.configuration.model}\`
`.trim()

    return Result.ok(LearnableTrajectory(example, { feedback }))
  }

  const baselineParametersHash = hashObject(Object.fromEntries(baseline.parameters.entries())).keyhash // prettier-ignore
  const optimizedParametersHash = hashObject(Object.fromEntries(parameters.entries())).keyhash // prettier-ignore
  if (optimizedParametersHash !== baselineParametersHash) {
    // Note: we treat prompt syntax errors as learnable
    const feedback = `
The optimized prompt must have the same parameters as the baseline prompt.
The parameters are: \`${Array.from(baseline.parameters).join(', ')}\`
`.trim()

    return Result.ok(LearnableTrajectory(example, { feedback }))
  }

  if (!optimization.configuration.scope?.configuration) {
    const baselineConfigurationHash = hashObject(baseline.configuration).hash
    const optimizedConfigurationHash = hashObject(configuration).hash
    if (optimizedConfigurationHash !== baselineConfigurationHash) {
      const feedback = `
The optimized prompt must have the same configuration as the baseline prompt.
The configuration is:
\`\`\`
${JSON.stringify(baseline.configuration, null, 2)}
\`\`\`
`.trim()

      return Result.ok(LearnableTrajectory(example, { feedback }))
    }
  }

  if (!optimization.configuration.scope?.instructions) {
    const baselineInstructionsHash = hashContent(baseline.instructions)
    const optimizedInstructionsHash = hashContent(instructions)
    if (optimizedInstructionsHash !== baselineInstructionsHash) {
      const feedback = `
The optimized prompt must have the same instructions as the baseline prompt.
The instructions are:
\`\`\`
${baseline.instructions}
\`\`\`
`.trim()

      return Result.ok(LearnableTrajectory(example, { feedback }))
    }
  }

  return Result.ok({ parameters })
}

async function runPrompt(
  {
    prompt,
    example,
    parameters,
    columns,
    optimization,
    document,
    commit,
    workspace,
    abortSignal,
  }: {
    prompt: string
    example: DatasetRow
    parameters: Set<string>
    columns: (Column & { datasetId: number })[]
    optimization: Optimization
    document: DocumentVersion
    commit: Commit
    workspace: WorkspaceDto
    abortSignal?: AbortSignal
  },
  _ = database,
) {
  const values: Record<string, unknown> = {}
  for (const parameter of parameters) {
    const column =
      optimization.configuration.parameters?.[parameter]?.column ?? parameter

    const identifier = columns.find(
      (c) => c.name === column && c.datasetId === example.datasetId,
    )!.identifier

    values[parameter] = example.rowData[identifier] ?? undefined
  }

  // TODO(AO/OPT): Abort signal seems to not be aborting the run.
  // Also "Controller is already closed" errors are being thrown.
  const running = await runDocumentAtCommit({
    context: BACKGROUND({ workspaceId: workspace.id }),
    source: LogSources.Optimization,
    parameters: values,
    customPrompt: prompt,
    simulationSettings: {
      simulateToolResponses:
        optimization.configuration.simulation?.simulateToolResponses ?? true,
      simulatedTools:
        optimization.configuration.simulation?.simulatedTools ?? [], // Note: empty array means all tools are simulated
      toolSimulationInstructions:
        optimization.configuration.simulation?.toolSimulationInstructions ?? '',
    },
    document: document,
    commit: commit,
    workspace: workspace,
    abortSignal: abortSignal,
  })
  if (running.error) {
    return Result.error(running.error)
  }
  const run = running.value

  const error = await run.error
  if (error) {
    if (isAbortError(error)) {
      return Result.error(error)
    }

    // BONUS(AO/OPT): Exponential backoff on rate limit errors
    if (isRetryableError(error)) {
      return Result.error(error)
    }

    // BONUS(AO/OPT): Check whether we can discern which errors are really learnable or not
    const feedback = `
The optimized prompt had an error while running it, it may or may not be fixable (schema errors are always fixable!).
The error is:
\`\`\`
${error.message}
\`\`\`
`.trim()

    return Result.ok(LearnableTrajectory(example, { feedback }))
  }

  const uuid = run.uuid
  let messages = await run.messages
  const duration = await run.duration
  const usage = await run.runUsage

  let turnsExecuted = 1
  const simulationSettings = optimization.configuration.simulation
  if (shouldRunMultiTurnSimulation(simulationSettings)) {
    const simulating = await simulateConversation({
      workspace: workspace,
      documentLogUuid: uuid,
      simulationSettings: simulationSettings,
      initialMessages: messages,
      abortSignal: abortSignal,
    })
    if (simulating.error) {
      if (isAbortError(simulating.error)) {
        return Result.error(simulating.error)
      }

      if (isRetryableError(simulating.error)) {
        return Result.error(simulating.error)
      }

      const feedback = `
The optimized prompt had an error during multi-turn simulation.
The error is:
\`\`\`
${simulating.error.message}
\`\`\`
`.trim()

      return Result.ok(LearnableTrajectory(example, { feedback }))
    }

    messages = simulating.value.messages
    turnsExecuted = simulating.value.turnsExecuted
  }

  return Result.ok({ uuid, messages, duration, usage, turnsExecuted })
}

async function evaluatePrompt<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    span,
    evaluation,
    commit,
    workspace,
  }: {
    prompt: string
    example: DatasetRow
    span: SpanWithDetails<MainSpanType>
    evaluation: EvaluationV2<T, M>
    optimization: Optimization
    document: DocumentVersion
    commit: Commit
    workspace: WorkspaceDto
    abortSignal?: AbortSignal
  },
  _ = database,
) {
  const evaluating = await runEvaluationV2({
    evaluation: evaluation,
    span: span,
    commit: commit,
    workspace: workspace,
    dry: true, // BONUS(AO/OPT): Decide whether we should persist evaluation results from optimizations
  })
  if (evaluating.error) {
    // BONUS(AO/OPT): Exponential backoff on rate limit errors
    if (isRetryableError(evaluating.error)) {
      return Result.error(evaluating.error)
    }

    return Result.error(evaluating.error)
  }
  const { result } = evaluating.value

  if (result.error) {
    return Result.error(
      new UnprocessableEntityError(
        `Error while evaluating prompt: ${result.error.message}`,
      ),
    )
  }

  // Note: not using enriched reason here because HITL evals are not really used for optimizations
  const specification = getEvaluationMetricSpecification(evaluation)
  const reason = specification.resultReason(
    result as EvaluationResultSuccessValue<T, M>,
  )

  const feedback = `
The optimized prompt was evaluated on this specific output:
\`\`\`
${result.metadata?.actualOutput || 'No output reported'}
\`\`\`

The evaluation ${result.hasPassed ? 'passed' : 'failed'} with a score of ${result.normalizedScore || 0}%, with the following reason:
\`\`\`
${reason || 'No reason reported'}
\`\`\`
`.trim()

  return Result.ok({
    score: result.normalizedScore ?? 0,
    feedback: feedback,
    passed: result.hasPassed ?? false,
  })
}

const TRACE_POLLING_INIT_DELAY = 500 // 500ms
const TRACE_POLLING_MAX_DELAY = 2 * 1000 // 2 seconds
const TRACE_POLLING_MAX_ATTEMPTS = 10 // ~20 seconds

async function waitForMainSpans({
  logUuid,
  expectedCount,
  workspace,
  abortSignal,
}: {
  logUuid: string
  expectedCount: number
  workspace: WorkspaceDto
  abortSignal?: AbortSignal
}) {
  const spansRepository = new SpansRepository(workspace.id)

  for (let attempt = 0; attempt < TRACE_POLLING_MAX_ATTEMPTS; attempt++) {
    if (abortSignal?.aborted) {
      return Result.error(new AbortedError())
    }

    if (attempt > 0) {
      const delay = calculateExponentialBackoff(attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    const allSpans = await spansRepository.listByDocumentLogUuid(logUuid)
    const mainSpans = allSpans.filter(isMainSpan)
    if (mainSpans.length >= expectedCount) {
      return Result.ok(mainSpans)
    }
  }

  return Result.error(
    new UnprocessableEntityError(
      'Expected main spans did not appear within timeout',
    ),
  )
}

async function enrichSpanWithMetadata(
  span: Span,
  workspace: WorkspaceDto,
) {
  const metadatasRepository = new SpanMetadatasRepository(workspace.id)
  const getting = await metadatasRepository.get({
    spanId: span.id,
    traceId: span.traceId,
  })
  if (getting.error) return Result.error(getting.error)

  const metadata = getting.value as SpanMetadata<MainSpanType>
  if (!metadata) {
    return Result.error(
      new UnprocessableEntityError(
        `Metadata not found for span ${span.id}`,
      ),
    )
  }

  return Result.ok({ ...span, metadata } as SpanWithDetails<MainSpanType>)
}

function aggregateEvaluationResults(
  results: { score: number; feedback: string; passed: boolean }[],
) {
  if (results.length === 0) {
    return { score: 0, feedback: 'No spans were evaluated.', passed: false }
  }

  if (results.length === 1) return results[0]!

  const score =
    results.reduce((sum, r) => sum + r.score, 0) / results.length
  const passed = results.every((r) => r.passed)
  const feedback = results
    .map((r, i) => `[Turn ${i + 1}]\n${r.feedback}`)
    .join('\n\n')

  return { score, feedback, passed }
}

function calculateExponentialBackoff(attempt: number): number {
  const exponentialDelay = TRACE_POLLING_INIT_DELAY * Math.pow(2, attempt)
  const cappedDelay = Math.min(exponentialDelay, TRACE_POLLING_MAX_DELAY)
  const jitter = cappedDelay * 0.1 * (Math.random() - 0.5) * 2
  return cappedDelay + jitter
}

function shouldRunMultiTurnSimulation(
  simulationSettings?: SimulationSettings,
): simulationSettings is SimulationSettings {
  return Boolean(
    simulationSettings?.maxTurns && simulationSettings.maxTurns > 1,
  )
}

async function simulateConversation({
  workspace,
  documentLogUuid,
  simulationSettings,
  initialMessages,
  abortSignal,
}: {
  workspace: WorkspaceDto
  documentLogUuid: string
  simulationSettings: SimulationSettings
  initialMessages: Message[]
  abortSignal?: AbortSignal
}) {
  const maxTurns = Math.min(
    simulationSettings.maxTurns ?? 1,
    MAX_SIMULATION_TURNS,
  )

  let messages = initialMessages
  let turnsExecuted = 1
  let currentTurn = 2

  while (currentTurn <= maxTurns) {
    if (abortSignal?.aborted) break

    const userActionResult = await generateSimulatedUserAction({
      messages,
      simulationInstructions: simulationSettings.simulatedUserGoal,
      currentTurn,
      maxTurns,
      abortSignal,
    })
    if (userActionResult.error) {
      return Result.error(userActionResult.error)
    }

    const userAction = userActionResult.value
    if (userAction.action === 'end') break

    const addResult = await addMessages({
      workspace,
      documentLogUuid,
      messages: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: userAction.message }],
        },
      ],
      source: LogSources.Optimization,
      abortSignal,
      simulationSettings,
    })
    if (addResult.error) {
      return Result.error(addResult.error)
    }

    const turnResult = addResult.value
    const turnError = await turnResult.error
    if (turnError) {
      return Result.error(turnError)
    }

    messages = await turnResult.messages
    turnsExecuted++
    currentTurn++
  }

  return Result.ok({ messages, turnsExecuted })
}
