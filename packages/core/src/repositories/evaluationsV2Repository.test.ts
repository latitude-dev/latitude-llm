import { beforeEach, describe, expect, it } from 'vitest'

import { type Workspace } from '../schema/models/types/Workspace'
import { mergeCommit } from '../services/commits'
import * as factories from '../tests/factories'
import { deleteEvaluationV2 } from '../services/evaluationsV2/delete'
import { EvaluationsV2Repository } from './evaluationsV2Repository'

describe('EvaluationsV2Repository', () => {
  let workspace: Workspace
  let repository: EvaluationsV2Repository

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createProject()
    workspace = createdWorkspace
    repository = new EvaluationsV2Repository(workspace.id)
  })

  describe('list', () => {
    it('returns empty array when projectId has no commits', async () => {
      const project = await factories.createProject({
        workspace,
        skipMerge: true,
      })

      // Create a commit for this test since commitUuid is now mandatory
      const { commit } = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })

      const result = await repository.list({
        projectId: project.project.id,
        commitUuid: commit.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations).toEqual([])
    })

    it('filters by commitUuid when commitUuid is provided', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const { commit: commit2 } = await factories.createProject({
        workspace,
        documents: { prompt: 'test2' },
      })

      const evaluation1 = await factories.createEvaluationV2({
        document: project.documents[0]!,
        commit: project.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: project.documents[0]!,
        commit: commit2,
        workspace,
      })

      const result = await repository.list({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('filters by projectId and documentUuid when both are provided', async () => {
      const project1 = await factories.createProject({
        workspace,
        documents: { prompt: 'test1' },
      })
      const project2 = await factories.createProject({
        workspace,
        documents: { prompt: 'test2' },
      })

      const document1 = project1.documents[0]!
      const document2 = project2.documents[0]!

      const evaluation1 = await factories.createEvaluationV2({
        document: document1,
        commit: project1.commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: document2,
        commit: project2.commit,
        workspace,
      })

      const result = await repository.list({
        projectId: project1.project.id,
        documentUuid: document1.documentUuid,
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

      const result = await repository.list({
        projectId: project1.project.id,
        commitUuid: project1.commit.uuid,
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

      // Delete one evaluation in a draft commit (not merged yet)
      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })
      await deleteEvaluationV2({
        evaluation: evaluation1,
        commit: draft,
        workspace,
      }).then((r) => r.unwrap())

      // List evaluations at the original merged commit - deleted one should still appear
      // because the deletion is only in a draft commit, not merged yet
      const result = await repository.list({
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

      // Create an evaluation in the first commit
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

      // Create a new commit and delete one evaluation
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

      // List at commit 2 - deleted evaluation should not appear
      const resultAtCommit2 = await repository.list({
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

      // List at commit 1 - evaluation should still appear (not deleted there)
      const resultAtCommit1 = await repository.list({
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

      // Create evaluations in the head commit
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

      // Delete one evaluation in a draft and merge it (so it's deleted in head)
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

      // Create a new draft commit
      const { commit: draft2 } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })

      // Fetch evaluations from the draft commit - deleted evaluation should not appear
      const result = await repository.list({
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

      // Create evaluations in the merged head commit
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

      // Create a draft commit
      const { commit: draft } = await factories.createDraft({
        project: project.project,
        user: project.user,
      })

      // Create NEW evaluations in the draft commit
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

      // Fetch evaluations from the draft commit - should include both head and draft evaluations
      const result = await repository.list({
        projectId: project.project.id,
        commitUuid: draft.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      // Should include evaluations from head commit
      expect(evaluations.some((e) => e.uuid === evaluationInHead1.uuid)).toBe(
        true,
      )
      expect(evaluations.some((e) => e.uuid === evaluationInHead2.uuid)).toBe(
        true,
      )

      // Should include evaluations created in draft commit
      expect(evaluations.some((e) => e.uuid === evaluationInDraft1.uuid)).toBe(
        true,
      )
      expect(evaluations.some((e) => e.uuid === evaluationInDraft2.uuid)).toBe(
        true,
      )

      // Should have all 4 evaluations
      expect(evaluations.length).toBe(4)
    })
  })
})
