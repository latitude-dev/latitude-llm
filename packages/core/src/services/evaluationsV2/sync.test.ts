import { Providers } from '@latitude-data/constants'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { database } from '../../client'
import {
  CompositeEvaluationConfiguration,
  CompositeEvaluationMetric,
  EvaluationType,
  LlmEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { DocumentVersionsRepository } from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Issue } from '../../schema/models/types/Issue'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { syncDefaultCompositeTarget } from './sync'

describe('syncDefaultCompositeTarget', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion
  let issue: Issue

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      project: p,
      documents,
      commit: c,
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
    commit = c
    document = documents[0]!

    const { issue: i } = await factories.createIssue({
      document,
      workspace,
      project,
    })
    issue = i

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  async function createLlmEvaluation(issueId?: number) {
    return factories.createEvaluationV2({
      document,
      commit,
      workspace,
      type: EvaluationType.Llm,
      metric: LlmEvaluationMetric.Binary,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        provider: 'openai',
        model: 'gpt-4o',
        criteria: 'test criteria',
        passDescription: 'pass',
        failDescription: 'fail',
      },
      issueId,
    })
  }

  async function getDocument() {
    const repo = new DocumentVersionsRepository(workspace.id)
    return repo
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())
  }

  async function getCompositeEvaluation(uuid: string) {
    const result = await database
      .select()
      .from(evaluationVersions)
      .where(
        and(
          eq(evaluationVersions.evaluationUuid, uuid),
          eq(evaluationVersions.commitId, commit.id),
        ),
      )
      .then((r) => r[0])

    if (!result) return undefined

    return {
      ...result,
      configuration:
        result.configuration as CompositeEvaluationConfiguration<CompositeEvaluationMetric>,
    }
  }

  describe('when no issue-linked evaluations exist', () => {
    it('does nothing when no composite exists', async () => {
      await createLlmEvaluation() // evaluation without issue
      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        document,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBeUndefined()

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBeNull()
    })

    it('deletes composite when it exists but no issue-linked evaluations remain', async () => {
      // First create an issue-linked evaluation to get a composite
      await createLlmEvaluation(issue.id)
      let doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!
      expect(compositeUuid).toBeDefined()

      // Now simulate removing the issue link by updating the evaluation
      // We need to delete the issue-linked evaluation for this test
      const evalVersion = await database
        .select()
        .from(evaluationVersions)
        .where(
          and(
            eq(evaluationVersions.commitId, commit.id),
            eq(evaluationVersions.type, EvaluationType.Llm),
          ),
        )
        .then((r) => r[0]!)

      await database
        .update(evaluationVersions)
        .set({ issueId: null })
        .where(eq(evaluationVersions.id, evalVersion.id))

      doc = await getDocument()
      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBeUndefined()

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBeNull()

      const composite = await getCompositeEvaluation(compositeUuid)
      expect(composite?.deletedAt).not.toBeNull()
    })
  })

  describe('when issue-linked evaluations exist', () => {
    it('creates composite when none exists', async () => {
      const evaluation = await createLlmEvaluation(issue.id)
      const doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      expect(compositeUuid).toBeDefined()
      const composite = await getCompositeEvaluation(compositeUuid)
      expect(composite).toEqual(
        expect.objectContaining({
          type: EvaluationType.Composite,
          metric: CompositeEvaluationMetric.Average,
          name: 'Performance',
          configuration: expect.objectContaining({
            evaluationUuids: expect.arrayContaining([evaluation.uuid]),
          }),
        }),
      )
    })

    it('updates composite to include all issue-linked evaluations', async () => {
      const evaluation1 = await createLlmEvaluation(issue.id)
      let doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      const { issue: issue2 } = await factories.createIssue({
        document,
        workspace,
        project,
      })
      const evaluation2 = await createLlmEvaluation(issue2.id)

      doc = await getDocument()

      const composite = await getCompositeEvaluation(compositeUuid)
      expect(composite?.configuration.evaluationUuids).toHaveLength(2)
      expect(composite?.configuration.evaluationUuids).toContain(
        evaluation1.uuid,
      )
      expect(composite?.configuration.evaluationUuids).toContain(
        evaluation2.uuid,
      )
    })

    it('only includes issue-linked evaluations in composite', async () => {
      const evaluation1 = await createLlmEvaluation(issue.id)
      await createLlmEvaluation() // no issue
      await createLlmEvaluation() // no issue

      const doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      const composite = await getCompositeEvaluation(compositeUuid)
      expect(composite?.configuration.evaluationUuids).toHaveLength(1)
      expect(composite?.configuration.evaluationUuids).toContain(
        evaluation1.uuid,
      )
    })
  })

  describe('when syncing removes evaluations from composite', () => {
    it('removes evaluation from composite when it loses issue and others remain', async () => {
      const evaluation1 = await createLlmEvaluation(issue.id)
      let doc = await getDocument()

      const { issue: issue2 } = await factories.createIssue({
        document,
        workspace,
        project,
      })
      const evaluation2 = await createLlmEvaluation(issue2.id)

      doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!
      const composite = await getCompositeEvaluation(compositeUuid)
      expect(composite?.configuration.evaluationUuids).toHaveLength(2)

      // Remove issue from evaluation1 by updating the database directly
      const evalVersion = await database
        .select()
        .from(evaluationVersions)
        .where(
          and(
            eq(evaluationVersions.evaluationUuid, evaluation1.uuid),
            eq(evaluationVersions.commitId, commit.id),
          ),
        )
        .then((r) => r[0]!)

      await database
        .update(evaluationVersions)
        .set({ issueId: null })
        .where(eq(evaluationVersions.id, evalVersion.id))

      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      const updatedComposite = result.unwrap()!
      expect(updatedComposite).toBeDefined()
      expect(updatedComposite.configuration.evaluationUuids).toHaveLength(1)
      expect(updatedComposite.configuration.evaluationUuids).not.toContain(
        evaluation1.uuid,
      )
      expect(updatedComposite.configuration.evaluationUuids).toContain(
        evaluation2.uuid,
      )

      const updatedDocument = await getDocument()
      expect(updatedDocument.mainEvaluationUuid).toBe(compositeUuid)
    })
  })

  describe('composite configuration is always reset', () => {
    it('resets composite configuration to default values on sync', async () => {
      const evaluation = await createLlmEvaluation(issue.id)
      const doc = await getDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      // Manually modify the composite configuration
      const compositeVersion = await database
        .select()
        .from(evaluationVersions)
        .where(
          and(
            eq(evaluationVersions.evaluationUuid, compositeUuid),
            eq(evaluationVersions.commitId, commit.id),
          ),
        )
        .then((r) => r[0]!)

      await database
        .update(evaluationVersions)
        .set({
          configuration: {
            reverseScale: true, // modified
            actualOutput: {
              messageSelection: 'last',
              parsingFormat: 'string',
            },
            expectedOutput: {
              parsingFormat: 'string',
            },
            evaluationUuids: [evaluation.uuid],
            minThreshold: 50, // modified
          },
          name: 'Custom Name', // modified
        })
        .where(eq(evaluationVersions.id, compositeVersion.id))

      // Sync should reset the configuration
      mocks.publisher.mockClear()
      const result = await syncDefaultCompositeTarget({
        document: doc,
        commit,
        workspace,
      })

      expect(Result.isOk(result)).toBe(true)
      const updatedComposite = result.unwrap()!

      expect(updatedComposite.name).toBe('Performance')
      expect(updatedComposite.configuration.reverseScale).toBe(false)
      expect(updatedComposite.configuration.minThreshold).toBe(75)
    })
  })

  describe('when commit is merged', () => {
    let mergedWorkspace: Workspace
    let mergedProject: Project
    let mergedCommit: Commit
    let mergedDocument: DocumentVersion
    let mergedIssue: Issue

    beforeEach(async () => {
      const {
        workspace: w,
        project: p,
        documents,
        commit: c,
      } = await factories.createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          prompt: factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-4o',
          }),
        },
      })

      mergedWorkspace = w
      mergedProject = p
      mergedCommit = c
      mergedDocument = documents[0]!

      expect(mergedCommit.mergedAt).not.toBeNull()

      const { issue: i } = await factories.createIssue({
        document: mergedDocument,
        workspace: mergedWorkspace,
        project: mergedProject,
      })
      mergedIssue = i
    })

    async function createMergedLlmEvaluation(issueId?: number) {
      return factories.createEvaluationV2({
        document: mergedDocument,
        commit: mergedCommit,
        workspace: mergedWorkspace,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          reverseScale: false,
          actualOutput: {
            messageSelection: 'last',
            parsingFormat: 'string',
          },
          provider: 'openai',
          model: 'gpt-4o',
          criteria: 'test criteria',
          passDescription: 'pass',
          failDescription: 'fail',
        },
        issueId,
      })
    }

    async function getMergedDocument() {
      const repo = new DocumentVersionsRepository(mergedWorkspace.id)
      return repo
        .getDocumentAtCommit({
          projectId: mergedProject.id,
          commitUuid: mergedCommit.uuid,
          documentUuid: mergedDocument.documentUuid,
        })
        .then((r) => r.unwrap())
    }

    async function getMergedCompositeEvaluation(uuid: string) {
      const result = await database
        .select()
        .from(evaluationVersions)
        .where(
          and(
            eq(evaluationVersions.evaluationUuid, uuid),
            eq(evaluationVersions.commitId, mergedCommit.id),
          ),
        )
        .then((r) => r[0])

      if (!result) return undefined

      return {
        ...result,
        configuration:
          result.configuration as CompositeEvaluationConfiguration<CompositeEvaluationMetric>,
      }
    }

    it('creates composite on merged commit when issue-linked evaluation exists', async () => {
      const evaluation = await createMergedLlmEvaluation(mergedIssue.id)
      const doc = await getMergedDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      expect(compositeUuid).toBeDefined()
      const composite = await getMergedCompositeEvaluation(compositeUuid)
      expect(composite).toEqual(
        expect.objectContaining({
          type: EvaluationType.Composite,
          metric: CompositeEvaluationMetric.Average,
          name: 'Performance',
          configuration: expect.objectContaining({
            evaluationUuids: expect.arrayContaining([evaluation.uuid]),
          }),
        }),
      )
    })

    it('updates composite on merged commit when new issue-linked evaluation is added', async () => {
      const evaluation1 = await createMergedLlmEvaluation(mergedIssue.id)
      let doc = await getMergedDocument()

      const { issue: issue2 } = await factories.createIssue({
        document: mergedDocument,
        workspace: mergedWorkspace,
        project: mergedProject,
      })
      const evaluation2 = await createMergedLlmEvaluation(issue2.id)

      doc = await getMergedDocument()
      const compositeUuid = doc.mainEvaluationUuid!
      const composite = await getMergedCompositeEvaluation(compositeUuid)
      expect(composite?.configuration.evaluationUuids).toHaveLength(2)
      expect(composite?.configuration.evaluationUuids).toContain(
        evaluation1.uuid,
      )
      expect(composite?.configuration.evaluationUuids).toContain(
        evaluation2.uuid,
      )
    })

    it('deletes composite on merged commit when last issue-linked evaluation loses issue', async () => {
      await createMergedLlmEvaluation(mergedIssue.id)
      let doc = await getMergedDocument()
      const compositeUuid = doc.mainEvaluationUuid!

      // Remove issue from the evaluation
      const evalVersion = await database
        .select()
        .from(evaluationVersions)
        .where(
          and(
            eq(evaluationVersions.commitId, mergedCommit.id),
            eq(evaluationVersions.type, EvaluationType.Llm),
          ),
        )
        .then((r) => r[0]!)

      await database
        .update(evaluationVersions)
        .set({ issueId: null })
        .where(eq(evaluationVersions.id, evalVersion.id))

      doc = await getMergedDocument()
      mocks.publisher.mockClear()

      const result = await syncDefaultCompositeTarget({
        document: doc,
        commit: mergedCommit,
        workspace: mergedWorkspace,
      })

      expect(Result.isOk(result)).toBe(true)
      expect(result.unwrap()).toBeUndefined()

      const updatedDocument = await getMergedDocument()
      expect(updatedDocument.mainEvaluationUuid).toBeNull()

      const composite = await getMergedCompositeEvaluation(compositeUuid)
      expect(composite?.deletedAt).not.toBeNull()
    })
  })
})
