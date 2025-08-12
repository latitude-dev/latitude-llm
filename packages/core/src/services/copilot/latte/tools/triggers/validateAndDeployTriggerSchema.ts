import { z } from 'zod'
import { defineLatteTool } from '../types'
import { PipedreamIntegration } from '../../../../../browser'
import {
  ConfigurableProps,
  ConfiguredProps,
  createBackendClient,
} from '@pipedream/sdk'
import { Result } from '../../../../../lib/Result'
import { getPipedreamEnvironment } from '../../../../integrations/pipedream/apps'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  IntegrationsRepository,
} from '../../../../../repositories'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { createDocumentTrigger } from '../../../../documentTriggers'
import {
  DocumentTriggerType,
  DocumentVersion,
  HEAD_COMMIT,
} from '@latitude-data/constants'
import { validateLattesChoices } from './configValidator'
import { PromisedResult } from '../../../../../lib/Transaction'

export const validateAndDeployTriggerSchema = defineLatteTool(
  async (
    {
      projectId,
      versionUuid,
      componentId,
      promptUuid,
      integrationId,
      payloadParameters,
      configuration,
    },
    { workspace },
  ) => {
    const documentResult = await getDocumentReadyForCreatingTrigger({
      workspaceId: workspace.id,
      projectId,
      versionUuid,
      promptUuid,
    })

    if (!Result.isOk(documentResult)) {
      return documentResult
    }

    const document = documentResult.unwrap()

    const pipedreamEnv = getPipedreamEnvironment()
    if (!pipedreamEnv.ok) {
      return Result.error(pipedreamEnv.error!)
    }

    const pipedream = createBackendClient(pipedreamEnv.unwrap())

    const integrationScope = new IntegrationsRepository(workspace.id)
    const integrationResult = await integrationScope.find(integrationId)

    if (!Result.isOk(integrationResult)) {
      return Result.error(integrationResult.error)
    }

    const integration = integrationResult.unwrap() as PipedreamIntegration

    const validatedSchema = await validateLattesChoices({
      pipedream,
      componentId,
      integration,
      lattesChoices: configuration as ConfiguredProps<ConfigurableProps>,
    })

    if (!Result.isOk(validatedSchema)) {
      return validatedSchema
    }

    const createDocumentTriggerResult = await createDocumentTrigger({
      workspace,
      document: document,
      projectId: projectId,
      trigger: {
        type: DocumentTriggerType.Integration,
        configuration: {
          componentId,
          integrationId,
          properties: configuration,
          payloadParameters: payloadParameters || [], // TODO - find way to validate this
        },
      },
    })

    if (!Result.isOk(createDocumentTriggerResult)) {
      return createDocumentTriggerResult
    }

    const createdDocumentTrigger = createDocumentTriggerResult.unwrap()

    return Result.ok({ createdDocumentTrigger })
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    componentId: z.string(),
    promptUuid: z.string(),
    integrationId: z.number(),
    payloadParameters: z.array(z.string()).optional(),
    configuration: z.record(z.any()),
  }),
)

const getDocumentReadyForCreatingTrigger = async ({
  workspaceId,
  projectId,
  versionUuid,
  promptUuid,
}: {
  workspaceId: number
  projectId: number
  versionUuid: string
  promptUuid: string
}): PromisedResult<DocumentVersion> => {
  const commitsScope = new CommitsRepository(workspaceId)
  const headCommit = await commitsScope
    .getHeadCommit(projectId)
    .then((r) => r.unwrap())

  if (
    headCommit == undefined ||
    (versionUuid !== headCommit.uuid && versionUuid !== HEAD_COMMIT)
  ) {
    return Result.error(
      new BadRequestError(
        `Cannot create triggers on a draft commit. Select a previous live commit or publish the draft.`,
      ),
    )
  }

  const documentsScope = new DocumentVersionsRepository(workspaceId)
  const documents = await documentsScope
    .getDocumentsAtCommit(headCommit)
    .then((r) => r.unwrap())

  const document = documents.find((doc) => doc.documentUuid === promptUuid)

  if (!document) {
    return Result.error(
      new NotFoundError(
        `Document with UUID ${promptUuid} not found in commit ${headCommit.uuid}.`,
      ),
    )
  }

  return Result.ok(document)
}
