import { env } from '@latitude-data/env'
import {
  EvaluationType,
  LlmEvaluationMetric,
  Workspace,
  type Commit,
  type DocumentVersion,
  findFirstModelForProvider,
  EvaluationConfigurationNumerical,
  EvaluationResultableType,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  User,
} from '../../browser'
import { connectEvaluations } from '../evaluations/connect'
import { createEvaluationV2 } from './create'
import { createEvaluation } from '../evaluations/create'
import { database } from '../../client'
import { findDefaultEvaluationProvider } from '../providerApiKeys/findDefaultProvider'

export async function createDemoEvaluation(
  {
    commit,
    document,
    evaluationsV2Enabled = true,
    user,
    workspace,
  }: {
    commit: Commit
    document: DocumentVersion
    evaluationsV2Enabled?: boolean
    user: User
    workspace: Workspace
  },
  db = database,
) {
  // Note: failing silently to avoid not letting the user create the document
  const result = await findDefaultEvaluationProvider(workspace!, db)
  if (result.error || !result.value) return
  const provider = result.value

  const model = findFirstModelForProvider({
    provider: provider,
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })
  if (!model) return

  if (evaluationsV2Enabled) {
    return await createEvaluationV2(
      {
        document: document,
        commit: commit,
        settings: {
          name: `Accuracy`,
          description: `Evaluates how well the given instructions are followed.`,
          type: EvaluationType.Llm,
          metric: LlmEvaluationMetric.Rating,
          configuration: {
            reverseScale: false,
            provider: provider.name,
            model: model,
            criteria:
              'Assess how well the response follows the given instructions.',
            minRating: 1,
            minRatingDescription:
              "Not faithful, doesn't follow the instructions.",
            maxRating: 5,
            maxRatingDescription:
              'Very faithful, does follow the instructions.',
            minThreshold: 4,
          },
        },
        options: {
          evaluateLiveLogs: true,
          enableSuggestions: true,
          autoApplySuggestions: true,
        },
        workspace: workspace!,
      },
      db,
    ).then((r) => r.unwrap())
  }

  // If evaluationsV2 is not enabled, we don't create an evaluation
  const evaluation = await createEvaluation(
    {
      workspace: workspace,
      user: user,
      name: `Accuracy`,
      description: `Evaluates how well the given instructions are followed.`,
      metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
      metadata: {
        objective:
          'Assess how well the response follows the given instructions.',
      } as EvaluationMetadataLlmAsJudgeSimple,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: {
        minValue: 1,
        maxValue: 5,
        minValueDescription: "Not faithful, doesn't follow the instructions.",
        maxValueDescription: 'Very faithful, does follow the instructions.',
      } as EvaluationConfigurationNumerical,
    },
    db,
  ).then((r) => r.unwrap())

  await connectEvaluations(
    {
      workspace: workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user: user,
      live: true,
    },
    db,
  ).then((r) => r.unwrap())
}
