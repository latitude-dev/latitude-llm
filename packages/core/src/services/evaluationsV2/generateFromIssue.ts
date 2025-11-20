import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { DocumentVersionsRepository } from '../../repositories'
import { Result } from '../../lib/Result'
import {
  CLOUD_MESSAGES,
  EvaluationType,
  LlmEvaluationBinarySpecification,
  LlmEvaluationMetric,
} from '../../constants'
import { env } from '@latitude-data/env'
import { database } from '../../client'
import { getCopilot } from '../copilot'
import { Copilot, runCopilot } from '../copilot'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { createEvaluationV2 } from './create'
import { assertCopilotIsSupported } from '../copilot/assertItsSupported'
import z from 'zod'
import { faker } from '@faker-js/faker'

const llmEvaluationBinarySpecificationWithoutModel =
  LlmEvaluationBinarySpecification.configuration
    .omit({
      model: true,
      provider: true,
      actualOutput: true,
    })
    .extend({
      name: z.string(),
    })

export async function generateEvaluationFromIssueWithCopilot(
  {
    issue,
    workspace,
    commit,
    providerName,
    model,
  }: {
    issue: Issue
    commit: Commit
    workspace: Workspace
    providerName: string
    model: string
  },
  db = database,
) {
  const assertResult = assertCopilotIsSupported(
    CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot,
  )

  if (!env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH) {
    return Result.error(
      new Error('COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set'),
    )
  }

  if (!Result.isOk(assertResult)) {
    return assertResult
  }

  const documentRepository = new DocumentVersionsRepository(workspace.id)
  const document = await documentRepository
    .getDocumentAtCommit({
      commitUuid: commit.uuid,
      documentUuid: issue.documentUuid,
    })
    .then((r) => r.unwrap())

  const copilotResult = await getCopilot(
    {
      path: env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH,
    },
    db,
  )

  if (!Result.isOk(copilotResult)) {
    return copilotResult
  }

  const copilot = copilotResult.unwrap()

  //TODO (evaluation-generation): We can add a progress caption here as well if things are getting long and we want to know what is really happening.

  const evaluationConfigResult = await generateEvaluationConfigForIssue({
    copilot: copilot,
    issue: issue,
    document: document,
    providerName: providerName,
    model: model,
  })

  if (!Result.isOk(evaluationConfigResult)) {
    return evaluationConfigResult
  }

  const evaluationConfig = evaluationConfigResult.unwrap()
  const evaluationResult = await createEvaluationV2({
    settings: {
      // TODO(evaluation-generation): name has to be unique, so we need another LLM to create it
      // TODO(evaluation-generation): zod error popped in workers, but didnt show up in frontend??
      name: faker.lorem.sentence(),
      description: LlmEvaluationBinarySpecification.description,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: evaluationConfig.configuration,
    },
    issueId: issue.id,
    document: document,
    workspace: workspace,
    commit: commit,
  })

  if (!Result.isOk(evaluationResult)) {
    return evaluationResult
  }

  const evaluation = evaluationResult.unwrap()

  return Result.ok(evaluation)
}

async function generateEvaluationConfigForIssue({
  copilot,
  issue,
  document,
  providerName,
  model,
}: {
  copilot: Copilot
  issue: Issue
  document: DocumentVersion
  providerName: string
  model: string
}) {
  //TODO(evaluation-generation): Add validation loop here
  const evaluationConfigResult = await runCopilot({
    copilot: copilot,
    parameters: {
      issueId: issue.id,
      issueDescription: issue.description,
      prompt: document.content,
    },
    schema: llmEvaluationBinarySpecificationWithoutModel,
  })

  if (!Result.isOk(evaluationConfigResult)) {
    return evaluationConfigResult
  }

  const evaluationConfig = evaluationConfigResult.unwrap()

  return Result.ok({
    configuration: {
      ...evaluationConfig,
      provider: providerName,
      model: model,
      actualOutput: {
        messageSelection: 'all' as const,
        parsingFormat: 'json' as const,
      },
    },
    name: evaluationConfig.name,
  })
}

export const __test__ = {
  generateEvaluationConfigForIssue,
  llmEvaluationBinarySpecificationWithoutModel,
}
