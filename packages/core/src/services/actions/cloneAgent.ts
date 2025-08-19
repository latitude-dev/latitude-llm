import { env } from '@latitude-data/env'
import {
  ActionType,
  cloneAgentActionBackendParametersSchema,
} from '../../browser'
import { database } from '../../client'
import { unsafelyFindProject, unsafelyFindWorkspace } from '../../data-access'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { forkDocument } from '../documents/forkDocument'
import { ActionExecuteArgs } from './shared'

export const CloneAgentActionSpecification = {
  parameters: cloneAgentActionBackendParametersSchema,
  execute: execute,
}

async function execute(
  { parameters, user, workspace }: ActionExecuteArgs<ActionType.CloneAgent>,
  db = database,
  _ = new Transaction(),
) {
  const getting = await getSampleAgent({ documentUuid: parameters.uuid }, db)
  if (getting.error) {
    return Result.error(getting.error)
  }
  const sample = getting.unwrap()

  const name = sample.document.path
    .split('/')
    .pop()
    ?.split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim()

  // FIXME: forkDocument should receive a transaction
  const forking = await forkDocument({
    title: name || 'New Agent',
    prefix: '',
    origin: {
      workspace: sample.workspace,
      commit: sample.commit,
      document: sample.document,
    },
    destination: { workspace, user },
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })
  if (forking.error) {
    return Result.error(forking.error)
  }
  const cloned = forking.unwrap()

  return Result.ok({
    projectId: cloned.project.id,
    commitUuid: cloned.commit.uuid,
  })
}

async function getSampleAgent(
  { documentUuid }: { documentUuid: string },
  db = database,
) {
  if (!env.SAMPLE_AGENTS_PROJECT_ID) {
    return Result.error(
      new UnprocessableEntityError('SAMPLE_AGENTS_PROJECT_ID is not set'),
    )
  }

  const project = await unsafelyFindProject(env.SAMPLE_AGENTS_PROJECT_ID, db)
  if (!project) {
    return Result.error(
      new UnprocessableEntityError('Sample Agents project not found'),
    )
  }

  const workspace = await unsafelyFindWorkspace(project.workspaceId, db)
  if (!workspace) {
    return Result.error(
      new UnprocessableEntityError('Sample Agents workspace not found'),
    )
  }

  const commitsRepository = new CommitsRepository(workspace.id, db)
  const gettingco = await commitsRepository.getHeadCommit(project.id)
  if (gettingco.error) {
    return Result.error(gettingco.error)
  }
  const commit = gettingco.unwrap()
  if (!commit) {
    return Result.error(
      new UnprocessableEntityError('Sample Agents commit not found'),
    )
  }

  const documentsRepository = new DocumentVersionsRepository(workspace.id, db)
  const gettingdo = await documentsRepository.getDocumentAtCommit({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: documentUuid,
  })
  if (gettingdo.error) {
    return Result.error(gettingdo.error)
  }
  const document = gettingdo.unwrap()
  if (!document) {
    return Result.error(
      new UnprocessableEntityError('Sample Agent document not found'),
    )
  }

  return Result.ok({ workspace, project, commit, document })
}
