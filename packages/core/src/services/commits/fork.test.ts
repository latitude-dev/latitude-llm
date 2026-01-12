import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import { EvaluationType, RuleEvaluationMetric } from '../../constants'
import {
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { forkCommit } from './fork'

describe('forkCommit', () => {
  const evaluationConfig = {
    type: EvaluationType.Rule as const,
    metric: RuleEvaluationMetric.RegularExpression as const,
    configuration: {
      reverseScale: false,
      actualOutput: {
        messageSelection: 'last' as const,
        parsingFormat: 'string' as const,
      },
      expectedOutput: {
        parsingFormat: 'string' as const,
      },
      pattern: '.*',
    },
  }

  describe('when forking a draft commit (no merged commits)', () => {
    let workspace: WorkspaceDto
    let project: Project
    let user: User
    let draftCommit: Commit
    let document: DocumentVersion

    beforeEach(async () => {
      const {
        workspace: w,
        project: p,
        commit: c,
        documents,
        user: u,
      } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        },
        skipMerge: true,
      })

      workspace = w
      project = p
      user = u
      draftCommit = c
      document = documents[0]!
    })

    it('creates a new commit with correct metadata', async () => {
      const result = await forkCommit({
        commit: draftCommit,
        workspace,
        project,
        user,
        data: {
          title: 'Forked Commit',
          description: 'Test fork',
        },
      }).then((r) => r.unwrap())

      expect(result.title).toBe('Forked Commit')
      expect(result.description).toBe('Test fork')
      expect(result.projectId).toBe(project.id)
      expect(result.mergedAt).toBeNull()
    })

    it('copies documents to the forked commit', async () => {
      const forkedCommit = await forkCommit({
        commit: draftCommit,
        workspace,
        project,
        user,
        data: { title: 'Forked' },
      }).then((r) => r.unwrap())

      const docsRepo = new DocumentVersionsRepository(workspace.id)
      const forkedDocs = await docsRepo
        .getDocumentsAtCommit(forkedCommit)
        .then((r) => r.unwrap())

      expect(forkedDocs).toHaveLength(1)
      expect(forkedDocs[0]!.documentUuid).toBe(document.documentUuid)
      expect(forkedDocs[0]!.path).toBe('prompt')
      expect(forkedDocs[0]!.content).toBe(document.content)
    })

    it('copies evaluations to the forked commit', async () => {
      await factories.createEvaluationV2({
        document,
        commit: draftCommit,
        workspace,
        ...evaluationConfig,
        name: 'Evaluation 1',
      })

      await factories.createEvaluationV2({
        document,
        commit: draftCommit,
        workspace,
        ...evaluationConfig,
        name: 'Evaluation 2',
      })

      const forkedCommit = await forkCommit({
        commit: draftCommit,
        workspace,
        project,
        user,
        data: { title: 'Forked' },
      }).then((r) => r.unwrap())

      const evalsRepo = new EvaluationsV2Repository(workspace.id)
      const forkedEvals = await evalsRepo
        .listAtCommit({
          projectId: project.id,
          commitUuid: forkedCommit.uuid,
        })
        .then((r) => r.unwrap())

      expect(forkedEvals).toHaveLength(2)
      expect(forkedEvals.map((e) => e.name).sort()).toEqual([
        'Evaluation 1',
        'Evaluation 2',
      ])
    })

    it('preserves soft-deleted documents', async () => {
      const { documentVersion: docToDelete } =
        await factories.createDocumentVersion({
          workspace,
          user,
          commit: draftCommit,
          path: 'to-be-deleted',
          content: factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        })

      await factories.markAsSoftDelete({
        documentUuid: docToDelete.documentUuid,
        commitId: draftCommit.id,
      })

      const forkedCommit = await forkCommit({
        commit: draftCommit,
        workspace,
        project,
        user,
        data: { title: 'Forked' },
      }).then((r) => r.unwrap())

      const docsRepo = new DocumentVersionsRepository(workspace.id)
      const visibleDocs = await docsRepo
        .getDocumentsAtCommit(forkedCommit)
        .then((r) => r.unwrap())

      expect(visibleDocs).toHaveLength(1)
      expect(visibleDocs[0]!.path).toBe('prompt')

      const docsRepoWithDeleted = new DocumentVersionsRepository(
        workspace.id,
        undefined,
        { includeDeleted: true },
      )
      const allDocs = await docsRepoWithDeleted
        .getDocumentsAtCommit(forkedCommit)
        .then((r) => r.unwrap())

      expect(allDocs).toHaveLength(2)
      const deletedDoc = allDocs.find((d) => d.path === 'to-be-deleted')
      expect(deletedDoc).toBeDefined()
      expect(deletedDoc!.deletedAt).not.toBeNull()
    })
  })

  describe('when forking a draft with merged history', () => {
    let workspace: WorkspaceDto
    let project: Project
    let user: User
    let mergedCommit: Commit
    let newDraft: Commit
    let existingDocument: DocumentVersion
    let newDocument: DocumentVersion

    beforeEach(async () => {
      const {
        workspace: w,
        project: p,
        commit: c,
        documents,
        user: u,
        providers,
      } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          'existing-prompt': factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        },
      })

      workspace = w
      project = p
      user = u
      mergedCommit = c
      existingDocument = documents[0]!

      const { commit } = await factories.createDraft({ project: p, user: u })
      newDraft = commit

      const { documentVersion } = await factories.createDocumentVersion({
        workspace: w,
        user: u,
        commit: newDraft,
        path: 'new-prompt',
        content: factories.helpers.createPrompt({
          provider: providers[0]!,
          model: 'gpt-4o',
        }),
      })
      newDocument = documentVersion
    })

    it('copies only the changes from the draft, not inherited documents', async () => {
      const forkedCommit = await forkCommit({
        commit: newDraft,
        workspace,
        project,
        user,
        data: { title: 'Forked' },
      }).then((r) => r.unwrap())

      const docsRepo = new DocumentVersionsRepository(workspace.id)

      const changesInFork = await docsRepo
        .listCommitChanges(forkedCommit)
        .then((r) => r.unwrap())

      expect(changesInFork).toHaveLength(1)
      expect(changesInFork[0]!.path).toBe('new-prompt')

      const allDocsAtFork = await docsRepo
        .getDocumentsAtCommit(forkedCommit)
        .then((r) => r.unwrap())

      expect(allDocsAtFork).toHaveLength(2)
      expect(allDocsAtFork.map((d) => d.path).sort()).toEqual([
        'existing-prompt',
        'new-prompt',
      ])
    })

    it('copies only evaluations from the draft, not inherited ones', async () => {
      await factories.createEvaluationV2({
        document: existingDocument,
        commit: mergedCommit,
        workspace,
        ...evaluationConfig,
        name: 'Merged Evaluation',
      })

      await factories.createEvaluationV2({
        document: newDocument,
        commit: newDraft,
        workspace,
        ...evaluationConfig,
        name: 'Draft Evaluation',
      })

      const forkedCommit = await forkCommit({
        commit: newDraft,
        workspace,
        project,
        user,
        data: { title: 'Forked' },
      }).then((r) => r.unwrap())

      const evalsRepo = new EvaluationsV2Repository(workspace.id)

      const changesInFork = await evalsRepo
        .getChangesInCommit(forkedCommit)
        .then((r) => r.unwrap())

      expect(changesInFork).toHaveLength(1)
      expect(changesInFork[0]!.name).toBe('Draft Evaluation')

      const allEvalsAtFork = await evalsRepo
        .listAtCommit({
          projectId: project.id,
          commitUuid: forkedCommit.uuid,
        })
        .then((r) => r.unwrap())

      expect(allEvalsAtFork).toHaveLength(2)
      expect(allEvalsAtFork.map((e) => e.name).sort()).toEqual([
        'Draft Evaluation',
        'Merged Evaluation',
      ])
    })
  })

  describe('when forking a merged commit', () => {
    let workspace: WorkspaceDto
    let project: Project
    let user: User
    let mergedCommit: Commit
    let document: DocumentVersion

    beforeEach(async () => {
      const {
        workspace: w,
        project: p,
        commit: c,
        documents,
        user: u,
      } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        },
      })

      workspace = w
      project = p
      user = u
      mergedCommit = c
      document = documents[0]!
    })

    it('copies documents that were changed in the merged commit', async () => {
      const forkedCommit = await forkCommit({
        commit: mergedCommit,
        workspace,
        project,
        user,
        data: { title: 'Forked' },
      }).then((r) => r.unwrap())

      const docsRepo = new DocumentVersionsRepository(workspace.id)

      const changesInFork = await docsRepo
        .listCommitChanges(forkedCommit)
        .then((r) => r.unwrap())

      expect(changesInFork).toHaveLength(1)
      expect(changesInFork[0]!.documentUuid).toBe(document.documentUuid)

      const allDocsAtFork = await docsRepo
        .getDocumentsAtCommit(forkedCommit)
        .then((r) => r.unwrap())

      expect(allDocsAtFork).toHaveLength(1)
      expect(allDocsAtFork[0]!.documentUuid).toBe(document.documentUuid)
    })

    it('copies evaluations that were changed in the merged commit', async () => {
      await factories.createEvaluationV2({
        document,
        commit: mergedCommit,
        workspace,
        ...evaluationConfig,
        name: 'Merged Evaluation',
      })

      const forkedCommit = await forkCommit({
        commit: mergedCommit,
        workspace,
        project,
        user,
        data: { title: 'Forked' },
      }).then((r) => r.unwrap())

      const evalsRepo = new EvaluationsV2Repository(workspace.id)

      const changesInFork = await evalsRepo
        .getChangesInCommit(forkedCommit)
        .then((r) => r.unwrap())

      expect(changesInFork).toHaveLength(1)
      expect(changesInFork[0]!.name).toBe('Merged Evaluation')

      const allEvalsAtFork = await evalsRepo
        .listAtCommit({
          projectId: project.id,
          commitUuid: forkedCommit.uuid,
        })
        .then((r) => r.unwrap())

      expect(allEvalsAtFork).toHaveLength(1)
      expect(allEvalsAtFork[0]!.name).toBe('Merged Evaluation')
    })
  })
})
