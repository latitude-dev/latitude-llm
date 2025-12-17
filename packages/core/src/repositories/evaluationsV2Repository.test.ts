import { beforeEach, describe, expect, it } from 'vitest'
import { type Workspace } from '../schema/models/types/Workspace'
import { mergeCommit } from '../services/commits'
import { deleteEvaluationV2 } from '../services/evaluationsV2/delete'
import { updateEvaluationV2 } from '../services/evaluationsV2/update'
import * as factories from '../tests/factories'
import { EvaluationsV2Repository } from './evaluationsV2Repository'

describe('EvaluationsV2Repository', () => {
  let workspace: Workspace
  let repository: EvaluationsV2Repository

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createProject()
    workspace = createdWorkspace
    repository = new EvaluationsV2Repository(workspace.id)
  })

  describe('listAtCommit', () => {
    it('returns empty array when project has no evaluations', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })

      const result = await repository.listAtCommit({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations).toEqual([])
    })

    it('returns evaluations from all documents in the commit', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt1: 'test1', prompt2: 'test2' },
      })
      const document1 = project.documents.find((d) => d.path === 'prompt1')!
      const document2 = project.documents.find((d) => d.path === 'prompt2')!

      const evaluation1 = await factories.createEvaluationV2({
        document: document1,
        commit: project.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: document2,
        commit: project.commit,
        workspace,
      })

      const result = await repository.listAtCommit({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(true)
      expect(evaluations.length).toBe(2)
    })

    it('only returns evaluations from the specified project', async () => {
      const project1 = await factories.createProject({
        workspace,
        documents: { prompt: 'test1' },
      })
      const project2 = await factories.createProject({
        workspace,
        documents: { prompt: 'test2' },
      })

      const evaluation1 = await factories.createEvaluationV2({
        document: project1.documents[0]!,
        commit: project1.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: project2.documents[0]!,
        commit: project2.commit,
        workspace,
      })

      const result = await repository.listAtCommit({
        projectId: project1.project.id,
        commitUuid: project1.commit.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('only returns evaluations from the correct workspace', async () => {
      const workspace2 = (
        await factories.createProject({ documents: { prompt: 'test' } })
      ).workspace
      const project1 = await factories.createProject({
        workspace,
        documents: { prompt: 'test1' },
      })
      const project2 = await factories.createProject({
        workspace: workspace2,
        documents: { prompt: 'test2' },
      })

      const evaluation1 = await factories.createEvaluationV2({
        document: project1.documents[0]!,
        commit: project1.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: project2.documents[0]!,
        commit: project2.commit,
        workspace: workspace2,
      })

      const result = await repository.listAtCommit({
        projectId: project1.project.id,
        commitUuid: project1.commit.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('includes evaluations from merged history commits', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluation1 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document,
        commit: draft,
        workspace,
      })

      const commit2 = await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repository.listAtCommit({
        projectId: project.project.id,
        commitUuid: commit2.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(true)
      expect(evaluations.length).toBe(2)
    })

    it('excludes deleted evaluations from merged commits', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluation1 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })
      await deleteEvaluationV2({
        evaluation: evaluation1,
        commit: draft,
        workspace,
      }).then((r) => r.unwrap())

      const commit2 = await mergeCommit(draft).then((r) => r.unwrap())

      const result = await repository.listAtCommit({
        projectId: project.project.id,
        commitUuid: commit2.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(false)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(true)
    })

    it('includes evaluations from draft commit along with history', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluationInHead = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })

      const evaluationInDraft = await factories.createEvaluationV2({
        document,
        commit: draft,
        workspace,
      })

      const result = await repository.listAtCommit({
        projectId: project.project.id,
        commitUuid: draft.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluationInHead.uuid)).toBe(
        true,
      )
      expect(evaluations.some((e) => e.uuid === evaluationInDraft.uuid)).toBe(
        true,
      )
      expect(evaluations.length).toBe(2)
    })
  })

  describe('listAtCommitByDocument', () => {
    it('returns empty array when document has no evaluations', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const result = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations).toEqual([])
    })

    it('filters evaluations by documentUuid', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt1: 'test1', prompt2: 'test2' },
      })
      const document1 = project.documents.find((d) => d.path === 'prompt1')!
      const document2 = project.documents.find((d) => d.path === 'prompt2')!

      const evaluation1 = await factories.createEvaluationV2({
        document: document1,
        commit: project.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: document2,
        commit: project.commit,
        workspace,
      })

      const result = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document1.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
      expect(evaluations.length).toBe(1)
    })

    it('only returns evaluations from the correct workspace', async () => {
      const workspace2 = (
        await factories.createProject({ documents: { prompt: 'test' } })
      ).workspace
      const project1 = await factories.createProject({
        workspace,
        documents: { prompt: 'test1' },
      })
      const project2 = await factories.createProject({
        workspace: workspace2,
        documents: { prompt: 'test2' },
      })

      const evaluation1 = await factories.createEvaluationV2({
        document: project1.documents[0]!,
        commit: project1.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: project2.documents[0]!,
        commit: project2.commit,
        workspace: workspace2,
      })

      const result = await repository.listAtCommitByDocument({
        projectId: project1.project.id,
        commitUuid: project1.commit.uuid,
        documentUuid: project1.documents[0]!.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('includes evaluation versions from merged commits even if deleted in unmerged draft', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluation1 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })
      await deleteEvaluationV2({
        evaluation: evaluation1,
        commit: draft,
        workspace,
      }).then((r) => r.unwrap())

      const result = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(true)
    })

    it('excludes deleted evaluation versions when merging history', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluation1 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })
      await deleteEvaluationV2({
        evaluation: evaluation1,
        commit: draft,
        workspace,
      }).then((r) => r.unwrap())

      const commit2 = await mergeCommit(draft).then((r) => r.unwrap())

      const resultAtCommit2 = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: commit2.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluationsAtCommit2 = resultAtCommit2.unwrap()

      expect(
        evaluationsAtCommit2.some((e) => e.uuid === evaluation1.uuid),
      ).toBe(false)
      expect(
        evaluationsAtCommit2.some((e) => e.uuid === evaluation2.uuid),
      ).toBe(true)

      const resultAtCommit1 = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluationsAtCommit1 = resultAtCommit1.unwrap()

      expect(
        evaluationsAtCommit1.some((e) => e.uuid === evaluation1.uuid),
      ).toBe(true)
      expect(
        evaluationsAtCommit1.some((e) => e.uuid === evaluation2.uuid),
      ).toBe(true)
    })

    it('excludes deleted evaluation versions from head commit when fetching from draft commit', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluation1 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const { commit: draft1 } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })
      await deleteEvaluationV2({
        evaluation: evaluation1,
        commit: draft1,
        workspace,
      }).then((r) => r.unwrap())

      await mergeCommit(draft1).then((r) => r.unwrap())

      const { commit: draft2 } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })

      const result = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: draft2.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(false)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(true)
    })

    it('includes evaluations created in draft commit along with evaluations from head commit', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluationInHead1 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const evaluationInHead2 = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })

      const evaluationInDraft1 = await factories.createEvaluationV2({
        document,
        commit: draft,
        workspace,
      })

      const evaluationInDraft2 = await factories.createEvaluationV2({
        document,
        commit: draft,
        workspace,
      })

      const result = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: draft.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluationInHead1.uuid)).toBe(
        true,
      )
      expect(evaluations.some((e) => e.uuid === evaluationInHead2.uuid)).toBe(
        true,
      )

      expect(evaluations.some((e) => e.uuid === evaluationInDraft1.uuid)).toBe(
        true,
      )
      expect(evaluations.some((e) => e.uuid === evaluationInDraft2.uuid)).toBe(
        true,
      )

      expect(evaluations.length).toBe(4)
    })

    it('returns the latest version of an evaluation when modified in draft', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluation = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
        name: 'Original Name',
      })

      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })

      const { evaluation: updatedEvaluation } = await updateEvaluationV2({
        evaluation,
        commit: draft,
        workspace,
        settings: { name: 'Updated Name' },
      }).then((r) => r.unwrap())

      const result = await repository.listAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: draft.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.length).toBe(1)
      expect(evaluations[0]!.uuid).toBe(evaluation.uuid)
      expect(evaluations[0]!.name).toBe('Updated Name')
      expect(evaluations[0]!.versionId).toBe(updatedEvaluation.versionId)
    })
  })

  describe('getAtCommitByDocument', () => {
    it('returns the evaluation when found', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const evaluation = await factories.createEvaluationV2({
        document,
        commit: project.commit,
        workspace,
      })

      const result = await repository.getAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
      })
      const found = result.unwrap()

      expect(found.uuid).toBe(evaluation.uuid)
    })

    it('returns error when evaluation is not found', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document = project.documents[0]!

      const result = await repository.getAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document.documentUuid,
        evaluationUuid: 'non-existent-uuid',
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toBe('Evaluation not found')
    })

    it('returns error when evaluation exists but for different document', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt1: 'test1', prompt2: 'test2' },
      })
      const document1 = project.documents.find((d) => d.path === 'prompt1')!
      const document2 = project.documents.find((d) => d.path === 'prompt2')!

      const evaluation = await factories.createEvaluationV2({
        document: document1,
        commit: project.commit,
        workspace,
      })

      const result = await repository.getAtCommitByDocument({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document2.documentUuid,
        evaluationUuid: evaluation.uuid,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toBe('Evaluation not found')
    })
  })
})
