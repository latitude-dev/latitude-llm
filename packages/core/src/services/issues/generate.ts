import { env } from '@latitude-data/env'
import { z } from 'zod'
import { cache as getCache } from '../../cache'
import { database } from '../../client'
import {
  CLOUD_MESSAGES,
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  ISSUE_GENERATION_CACHE_KEY,
} from '../../constants'
import { UnprocessableEntityError } from '../../lib/errors'
import { hashContent } from '../../lib/hashContent'
import { Result } from '../../lib/Result'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type ResultWithEvaluationV2 } from '../../schema/types'
import { getCopilot, runCopilot } from '../copilot'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'
import { validateResultForIssue } from './results/validate'

const generatorSchema = z.object({
  title: z.string().max(256),
  description: z.string(),
})
type GeneratorSchema = z.infer<typeof generatorSchema>

export async function generateIssue(
  {
    context,
    results,
    workspace,
  }: {
    context?: string
    results: ResultWithEvaluationV2[]
    workspace: Workspace
  },
  db = database,
) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(new Error(CLOUD_MESSAGES.issueDiscovery))
  }

  if (!env.COPILOT_PROMPT_ISSUE_DETAILS_GENERATOR_PATH) {
    return Result.error(
      new Error('COPILOT_PROMPT_ISSUE_DETAILS_GENERATOR_PATH is not set'),
    )
  }

  const getting = await getCopilot(
    { path: env.COPILOT_PROMPT_ISSUE_DETAILS_GENERATOR_PATH },
    db,
  )
  if (getting.error) {
    return Result.error(getting.error)
  }
  const copilot = getting.value

  const filtered = []
  for (const result of results) {
    const validation = await validateResultForIssue(
      { result, workspace, skipBelongsCheck: true },
      db,
    )
    if (validation.error) continue
    filtered.push(result)
  }

  const reasons = filtered
    .map(
      <T extends EvaluationType, M extends EvaluationMetric<T>>({
        evaluation,
        result,
      }: ResultWithEvaluationV2<T, M>) => {
        const specification = getEvaluationMetricSpecification(evaluation)
        const reason = specification.resultReason(
          result as EvaluationResultSuccessValue<T, M>,
        )

        return reason
      },
    )
    .filter((reason): reason is string => !!reason?.trim())

  if (reasons.length === 0) {
    return Result.error(
      new UnprocessableEntityError('Not enough reasons found'),
    )
  }

  const parameters = { context: context ?? '', reasons }

  const cache = await getCache()
  const key = ISSUE_GENERATION_CACHE_KEY(
    hashContent(JSON.stringify(parameters)),
  )

  try {
    const item = await cache.get(key)
    if (item) return Result.ok<GeneratorSchema>(JSON.parse(item))
  } catch (_) {
    // Note: doing nothing
  }

  const running = await runCopilot({
    copilot: copilot,
    parameters: parameters,
    schema: generatorSchema,
  })
  if (running.error) {
    return Result.error(running.error)
  }
  const result = running.value

  try {
    const item = JSON.stringify(result)
    await cache.set(key, item)
  } catch (_) {
    // Note: doing nothing
  }

  return Result.ok(result)
}
