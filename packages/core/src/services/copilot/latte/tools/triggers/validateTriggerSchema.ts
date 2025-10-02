import { z } from 'zod'
import { defineLatteTool } from '../types'
import { PipedreamIntegration } from '../../../../../schema/types'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk'
import { Result } from '../../../../../lib/Result'
import { getPipedreamClient } from '../../../../integrations/pipedream/apps'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  IntegrationsRepository,
} from '../../../../../repositories'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { HEAD_COMMIT } from '@latitude-data/constants'
import { validateLattesChoices } from './configValidator'
import { PromisedResult } from '../../../../../lib/Transaction'

export const validateTriggerSchema = defineLatteTool(
  async (
    {
      projectId,
      versionUuid,
      componentId,
      promptUuid,
      integrationId,
      configuration,
    },
    { workspace },
  ) => {
    const documentResult = await validateDocumentReadyForCreatingTrigger({
      workspaceId: workspace.id,
      projectId,
      versionUuid,
      promptUuid,
    })

    if (!Result.isOk(documentResult)) {
      return documentResult
    }

    const pipedreamResult = getPipedreamClient()
    if (!pipedreamResult.ok) return pipedreamResult
    const pipedream = pipedreamResult.unwrap()

    const integrationScope = new IntegrationsRepository(workspace.id)
    const integrationResult = await integrationScope.find(integrationId)

    if (!Result.isOk(integrationResult)) {
      return Result.error(integrationResult.error)
    }

    const integration = integrationResult.unwrap() as PipedreamIntegration

    const validatedSchema = await validateLattesChoices({
      // TODO - find way to validate payload parameters also
      pipedream,
      componentId,
      integration,
      lattesChoices: configuration as ConfiguredProps<ConfigurableProps>,
    })

    if (!Result.isOk(validatedSchema)) {
      return validatedSchema
    }

    return Result.ok({ validatedSchema })
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    componentId: z.string(),
    promptUuid: z.string(),
    integrationId: z.number(),
    configuration: z.record(z.any()),
  }),
)

const validateDocumentReadyForCreatingTrigger = async ({
  workspaceId,
  projectId,
  versionUuid,
  promptUuid,
}: {
  workspaceId: number
  projectId: number
  versionUuid: string
  promptUuid: string
}): PromisedResult<boolean> => {
  const commitsScope = new CommitsRepository(workspaceId)
  const headCommit = await commitsScope
    .getHeadCommit(projectId)
    .then((r) => r.unwrap())

  if (
    headCommit !== undefined &&
    (versionUuid === headCommit.uuid || versionUuid === HEAD_COMMIT)
  ) {
    return Result.error(
      new BadRequestError(
        `Cannot create triggers on a live commit. Select a previous draft commit.`,
      ),
    )
  }

  const documentsScope = new DocumentVersionsRepository(workspaceId)
  const commit = await commitsScope
    .getCommitByUuid({ uuid: versionUuid })
    .then((r) => r.unwrap())

  const documents = await documentsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  const document = documents.find((doc) => doc.documentUuid === promptUuid)

  if (!document) {
    return Result.error(
      new NotFoundError(
        `Document with UUID ${promptUuid} not found in commit ${headCommit.uuid}.`,
      ),
    )
  }

  return Result.ok(true)
}
