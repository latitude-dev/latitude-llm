import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { findFirstProject } from '../../queries/projects/findFirst'
import { Workspace } from '../../schema/models/types/Workspace'
import { User } from '../../schema/models/types/User'
import { createProject } from '../projects/create'
import { createNewDocument } from './create'
import { ONBOARDING_DOCUMENT_PATH } from '../../constants'
import Transaction from '../../lib/Transaction'

export async function getOrCreateOnboardingDocument(
  {
    workspace,
    user,
  }: {
    workspace: Workspace
    user: User
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    let project = await findFirstProject({ workspaceId: workspace.id }, tx)
    let commit = null

    if (!project) {
      const createResult = await createProject(
        {
          name: 'Onboarding',
          workspace,
          user,
        },
        transaction,
      )
      if (createResult.error) {
        return Result.error(createResult.error)
      }
      const created = createResult.unwrap()
      project = created.project
      commit = created.commit
    } else {
      const commitsRepo = new CommitsRepository(workspace.id, tx)
      const commitResult = await commitsRepo.getFirstCommitForProject(project)
      if (commitResult.error) {
        return Result.error(commitResult.error)
      }
      commit = commitResult.unwrap()
    }

    if (!commit) {
      return Result.error(new Error('No commit found for project'))
    }

    const docsRepo = new DocumentVersionsRepository(workspace.id, tx)
    const docsResult = await docsRepo.getDocumentsAtCommit(commit)
    if (docsResult.error) {
      return Result.error(docsResult.error)
    }

    let documents = docsResult.unwrap()
    let document = documents.find((d) => d.path === ONBOARDING_DOCUMENT_PATH)

    if (!document) {
      const docResult = await createNewDocument(
        {
          workspace,
          user,
          commit,
          path: ONBOARDING_DOCUMENT_PATH,
          createDemoEvaluation: true,
          includeDefaultContent: false,
        },
        transaction,
      )
      if (docResult.error) {
        return Result.error(docResult.error)
      }
      document = docResult.unwrap()
      documents = [...documents, document]
    }

    return Result.ok({ documents, commit, project })
  })
}
