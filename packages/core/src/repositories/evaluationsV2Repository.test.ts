import { beforeEach, describe, expect, it } from 'vitest'

import { type Workspace } from '../schema/models/types/Workspace'
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

  describe('list', () => {
    it('returns all evaluations for the workspace when no filters are provided', async () => {
      const { commit, documents } = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })

      const document1 = documents[0]!
      const document2 =
        documents[1] ||
        (
          await factories.createProject({
            workspace,
            documents: { prompt: 'test' },
          })
        ).documents[0]!

      const evaluation1 = await factories.createEvaluationV2({
        document: document1,
        commit,
        workspace,
      })

      const evaluation2 = await factories.createEvaluationV2({
        document: document2,
        commit,
        workspace,
      })

      const result = await repository.list({})
      const evaluations = result.unwrap()

      expect(evaluations.length).toBeGreaterThanOrEqual(2)
      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(true)
    })

    it('filters by projectId when only projectId is provided', async () => {
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

      const result = await repository.list({
        projectId: project1.project.id,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('returns empty array when projectId has no commits', async () => {
      const project = await factories.createProject({
        workspace,
        skipMerge: true,
      })

      const result = await repository.list({
        projectId: project.project.id,
      })
      const evaluations = result.unwrap()

      expect(evaluations).toEqual([])
    })

    it('filters by commitUuid when commitUuid and projectId are provided', async () => {
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

    it('filters by documentUuid when only documentUuid is provided', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document1 = project.documents[0]!
      const document2 =
        project.documents[1] ||
        (
          await factories.createProject({
            workspace,
            documents: { prompt: 'test' },
          })
        ).documents[0]!

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

      const result = await repository.list({
        documentUuid: document1.documentUuid,
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
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('uses history merging logic when commitUuid, documentUuid, and projectId are provided', async () => {
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

      const result = await repository.list({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation.uuid)).toBe(true)
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
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('combines multiple filters correctly', async () => {
      const project = await factories.createProject({
        workspace,
        documents: { prompt: 'test' },
      })
      const document1 = project.documents[0]!
      const document2 =
        project.documents[1] ||
        (
          await factories.createProject({
            workspace,
            documents: { prompt: 'test' },
          })
        ).documents[0]!

      const { commit: commit2 } = await factories.createProject({
        workspace,
        documents: { prompt: 'test2' },
      })

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

      const evaluation3 = await factories.createEvaluationV2({
        document: document1,
        commit: commit2,
        workspace,
      })

      const result = await repository.list({
        projectId: project.project.id,
        commitUuid: project.commit.uuid,
        documentUuid: document1.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
      expect(evaluations.some((e) => e.uuid === evaluation3.uuid)).toBe(false)
    })

    it('ignores commitUuid when projectId is not provided and filters by documentUuid only', async () => {
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
        document:
          project.documents[1] ||
          (
            await factories.createProject({
              workspace,
              documents: { prompt: 'test' },
            })
          ).documents[0]!,
        commit: project.commit,
        workspace,
      })

      const result = await repository.list({
        commitUuid: project.commit.uuid,
        documentUuid: document.documentUuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(false)
    })

    it('ignores commitUuid when projectId is not provided and returns all evaluations', async () => {
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

      const result = await repository.list({
        commitUuid: project1.commit.uuid,
      })
      const evaluations = result.unwrap()

      expect(evaluations.some((e) => e.uuid === evaluation1.uuid)).toBe(true)
      expect(evaluations.some((e) => e.uuid === evaluation2.uuid)).toBe(true)
    })
  })
})
