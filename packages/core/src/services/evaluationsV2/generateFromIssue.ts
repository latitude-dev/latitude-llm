import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import {
  DocumentVersionsRepository,
  IssuesRepository,
  ProviderApiKeysRepository,
} from '../../repositories'
import { Result } from '../../lib/Result'
import {
  BadRequestError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../lib/errors'
import {
  CLOUD_MESSAGES,
  EvaluationType,
  LlmEvaluationBinaryConfiguration,
  LlmEvaluationBinarySpecification,
  LlmEvaluationMetric,
} from '../../constants'
import { env } from '@latitude-data/env'
import { database } from '../../client'
import { getCopilot } from '../copilot'
import { Copilot, runCopilot } from '../copilot'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { PromisedResult } from '../../lib/Transaction'
import { createEvaluationV2 } from './create'
import { findFirstModelForProvider } from '../ai/providers/models'
import { ProviderApiKey } from '../../schema/models/types/ProviderApiKey'

const llmEvaluationBinarySpecificationWithoutModel =
  LlmEvaluationBinarySpecification.configuration.omit({
    model: true,
    provider: true,
  })

export async function generateEvaluationFromIssueWithCopilot(
  {
    issueId,
    workspace,
    commit,
  }: {
    issueId: number
    commit: Commit
    workspace: Workspace
  },
  db = database,
) {
  if (!env.LATITUDE_CLOUD) {
    return Result.error(
      new BadRequestError(CLOUD_MESSAGES.generateEvaluationIssueUsingCopilot),
    )
  }
  if (!env.COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH) {
    return Result.error(
      new BadRequestError(
        'COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH is not set',
      ),
    )
  }

  const issuesRepository = new IssuesRepository(workspace.id)
  const issue = await issuesRepository.find(issueId).then((r) => r.unwrap())

  const documentRepository = new DocumentVersionsRepository(workspace.id)
  const document = await documentRepository
    .getDocumentAtCommit({
      commitUuid: commit.uuid,
      documentUuid: issue.documentUuid,
    })
    .then((r) => r.unwrap())

  // TODO(evaluation-generation): Figure out what to do with the provider/model, do we get it from frontend?
  const providerRepository = new ProviderApiKeysRepository(workspace.id)
  const provider = await providerRepository.findFirst().then((r) => r.unwrap())
  if (!provider) {
    return Result.error(new NotFoundError('Provider not found'))
  }

  const model = findFirstModelForProvider({
    provider: provider,
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })
  if (!model) {
    return Result.error(new NotFoundError('Model not found'))
  }

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
  const evaluationConfigResult = await generateEvaluationConfigForIssue({
    copilot: copilot,
    issue: issue,
    document: document,
    provider: provider,
    model: model,
  })

  if (!Result.isOk(evaluationConfigResult)) {
    return evaluationConfigResult
  }

  const evaluationConfig = evaluationConfigResult.unwrap()
  const evaluationResult = await createEvaluationV2({
    settings: {
      name: LlmEvaluationBinarySpecification.name,
      description: LlmEvaluationBinarySpecification.description,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: evaluationConfig,
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
  provider,
  model,
}: {
  copilot: Copilot
  issue: Issue
  document: DocumentVersion
  provider: ProviderApiKey
  model: string
}): PromisedResult<LlmEvaluationBinaryConfiguration, UnprocessableEntityError> {
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
    ...evaluationConfig,
    provider: provider.name,
    model: model,
  })
}

export const __test__ = {
  generateEvaluationConfigForIssue,
  llmEvaluationBinarySpecificationWithoutModel,
}
