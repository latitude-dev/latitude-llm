import { beforeEach, describe, expect, it } from 'vitest'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Project } from '../../../schema/models/types/Project'
import { type User } from '../../../schema/models/types/User'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { Providers, ModifiedDocumentType } from '@latitude-data/constants'
import * as factories from '../../../tests/factories'
import { createProject, createDraft, helpers } from '../../../tests/factories'
import { getCommitEvaluationChanges } from './getEvaluationChanges'
import { mergeCommit } from '../../commits/merge'
import { deleteEvaluationV2 } from '../delete'
import { updateEvaluationV2 } from '../update'
import { findHeadCommit } from '../../../data-access/commits'

let project: Project
let draftCommit: Commit
let documents: DocumentVersion[]
let workspace: Workspace
let user: User

describe('getCommitEvaluationChanges', () => {
  beforeEach(async () => {
    const {
      project: prj,
      user: usr,
      workspace: ws,
      documents: docs,
    } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: helpers.createPrompt({
          provider: 'openai',
          content: 'content1',
        }),
        doc2: helpers.createPrompt({
          provider: 'openai',
          content: 'content2',
        }),
      },
    })
    workspace = ws
    user = usr
    project = prj
    documents = docs
    const { commit: draft } = await createDraft({ project, user })
    draftCommit = draft
  })

  describe('draft commits', () => {
    it('shows no changes when no evaluations exist', async () => {
      const changes = await getCommitEvaluationChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toEqual([])
    })

    it('shows created evaluations in draft compared to head', async () => {
      // Create evaluation in draft
      const evaluation = await factories.createEvaluationV2({
        document: documents[0]!,
        commit: draftCommit,
        workspace: workspace,
      })

      const changes = await getCommitEvaluationChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        evaluationUuid: evaluation.uuid,
        documentUuid: documents[0]!.documentUuid,
        name: evaluation.name,
        type: evaluation.type,
        changeType: ModifiedDocumentType.Created,
      })
    })

    it('shows updated evaluations in draft compared to head', async () => {
      // Create evaluation in head
      const headCommit = await findHeadCommit({ projectId: project.id }).then(
        (r) => r.unwrap(),
      )
      const evaluation = await factories.createEvaluationV2({
        document: documents[0]!,
        commit: headCommit,
        workspace: workspace,
      })

      // Update evaluation in draft
      await updateEvaluationV2({
        evaluation,
        workspace,
        commit: draftCommit,
        settings: {
          name: 'Updated evaluation',
        },
      }).then((r) => r.unwrap())

      const changes = await getCommitEvaluationChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        evaluationUuid: evaluation.uuid,
        documentUuid: documents[0]!.documentUuid,
        name: 'Updated evaluation',
        type: evaluation.type,
        changeType: ModifiedDocumentType.Updated,
      })
    })

    it('shows deleted evaluations in draft compared to head', async () => {
      // Create evaluation in head
      const headCommit = await findHeadCommit({ projectId: project.id }).then(
        (r) => r.unwrap(),
      )
      const evaluation = await factories.createEvaluationV2({
        document: documents[0]!,
        commit: headCommit,
        workspace: workspace,
      })

      // Delete evaluation in draft
      await deleteEvaluationV2({
        evaluation,
        workspace,
        commit: draftCommit,
      }).then((r) => r.unwrap())

      const changes = await getCommitEvaluationChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        evaluationUuid: evaluation.uuid,
        documentUuid: documents[0]!.documentUuid,
        name: evaluation.name,
        type: evaluation.type,
        changeType: ModifiedDocumentType.Deleted,
      })
    })

    it('handles multiple changes of different types', async () => {
      const headCommit = await findHeadCommit({ projectId: project.id }).then(
        (r) => r.unwrap(),
      )

      // Create evaluation in head to be deleted
      const deletedEval = await factories.createEvaluationV2({
        document: documents[0]!,
        commit: headCommit,
        workspace: workspace,
        name: 'Deleted Evaluation',
      })

      // Create evaluation in head to be updated
      const updatedEval = await factories.createEvaluationV2({
        document: documents[0]!,
        commit: headCommit,
        workspace: workspace,
        name: 'Original Name',
      })

      // Delete first evaluation in draft
      await deleteEvaluationV2({
        evaluation: deletedEval,
        workspace,
        commit: draftCommit,
      }).then((r) => r.unwrap())

      // Update second evaluation in draft
      await updateEvaluationV2({
        evaluation: updatedEval,
        workspace,
        commit: draftCommit,
        settings: {
          name: 'Updated Name',
        },
      }).then((r) => r.unwrap())

      // Create new evaluation in draft
      const newEval = await factories.createEvaluationV2({
        document: documents[1]!,
        commit: draftCommit,
        workspace: workspace,
        name: 'New Evaluation',
      })

      const changes = await getCommitEvaluationChanges({
        commit: draftCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toHaveLength(3)

      const createdChange = changes.find(
        (c) => c.evaluationUuid === newEval.uuid,
      )
      expect(createdChange).toEqual({
        evaluationUuid: newEval.uuid,
        documentUuid: documents[1]!.documentUuid,
        name: 'New Evaluation',
        type: newEval.type,
        changeType: ModifiedDocumentType.Created,
      })

      const updatedChange = changes.find(
        (c) => c.evaluationUuid === updatedEval.uuid,
      )
      expect(updatedChange).toEqual({
        evaluationUuid: updatedEval.uuid,
        documentUuid: documents[0]!.documentUuid,
        name: 'Updated Name',
        type: updatedEval.type,
        changeType: ModifiedDocumentType.Updated,
      })

      const deletedChange = changes.find(
        (c) => c.evaluationUuid === deletedEval.uuid,
      )
      expect(deletedChange).toEqual({
        evaluationUuid: deletedEval.uuid,
        documentUuid: documents[0]!.documentUuid,
        name: 'Deleted Evaluation',
        type: deletedEval.type,
        changeType: ModifiedDocumentType.Deleted,
      })
    })
  })

  describe('merged commits', () => {
    it('shows changes compared to previous commit', async () => {
      // Create evaluation in head
      const headCommit = await findHeadCommit({ projectId: project.id }).then(
        (r) => r.unwrap(),
      )
      const evaluation = await factories.createEvaluationV2({
        document: documents[0]!,
        commit: headCommit,
        workspace: workspace,
      })

      // Update evaluation in draft
      await updateEvaluationV2({
        evaluation,
        workspace,
        commit: draftCommit,
        settings: {
          name: 'Updated in draft',
        },
      }).then((r) => r.unwrap())

      // Merge the draft
      const mergedCommit = await mergeCommit(draftCommit).then((r) =>
        r.unwrap(),
      )

      const changes = await getCommitEvaluationChanges({
        commit: mergedCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        evaluationUuid: evaluation.uuid,
        documentUuid: documents[0]!.documentUuid,
        name: 'Updated in draft',
        type: evaluation.type,
        changeType: ModifiedDocumentType.Updated,
      })
    })

    it('shows empty changes when merged commit has no evaluation changes', async () => {
      // Create a document change so the commit can be merged
      await factories.createDocumentVersion({
        workspace: workspace,
        user: user,
        commit: draftCommit,
        path: 'new-doc',
        content: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'New document',
        }),
      })

      // Merge the draft without any evaluation changes
      const mergedCommit = await mergeCommit(draftCommit).then((r) =>
        r.unwrap(),
      )

      const changes = await getCommitEvaluationChanges({
        commit: mergedCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toEqual([])
    })

    it('shows all evaluations as new for first merged commit', async () => {
      // Create evaluation in the initial commit (head)
      const headCommit = await findHeadCommit({ projectId: project.id }).then(
        (r) => r.unwrap(),
      )
      await factories.createEvaluationV2({
        document: documents[0]!,
        commit: headCommit,
        workspace: workspace,
      })

      const changes = await getCommitEvaluationChanges({
        commit: headCommit,
        workspace,
      }).then((r) => r.unwrap())

      expect(changes).toHaveLength(1)
      expect(changes[0]!.changeType).toBe(ModifiedDocumentType.Created)
    })
  })
})
