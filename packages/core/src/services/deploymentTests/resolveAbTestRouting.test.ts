import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LogSources } from '@latitude-data/constants'
import * as factories from '../../tests/factories'
import { resolveAbTestRouting } from './resolveAbTestRouting'
import { createDeploymentTest } from './create'
import { startDeploymentTest } from './start'
import { routeRequest } from './routeRequest'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { mergeCommit } from '../commits'

vi.mock('./routeRequest')

const BASELINE_CONTENT = 'BASELINE_PROMPT_CONTENT'
const CHALLENGER_CONTENT = 'CHALLENGER_PROMPT_CONTENT'

describe('resolveAbTestRouting', () => {
  let workspace: Awaited<
    ReturnType<typeof factories.createWorkspace>
  >['workspace']
  let user: Awaited<ReturnType<typeof factories.createWorkspace>>['userData']
  let project: Awaited<ReturnType<typeof factories.createProject>>['project']
  let headCommit: Awaited<ReturnType<typeof factories.createProject>>['commit']
  let challengerCommit: Awaited<ReturnType<typeof factories.createCommit>>
  let baselineDocument: DocumentVersion
  let challengerDocument: DocumentVersion
  let provider: Awaited<
    ReturnType<typeof factories.createProject>
  >['providers'][number]

  beforeEach(async () => {
    const workspaceData = await factories.createWorkspace()
    workspace = workspaceData.workspace
    user = workspaceData.userData

    const projectData = await factories.createProject({ workspace })
    project = projectData.project
    provider = projectData.providers[0]!

    const { commit: baselineDraft } = await factories.createDraft({
      project,
      user,
    })
    const { documentVersion: doc } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: baselineDraft,
      path: 'test-doc',
      content: factories.helpers.createPrompt({
        provider,
        content: BASELINE_CONTENT,
      }),
    })
    headCommit = await mergeCommit(baselineDraft).then((r) => r.unwrap())
    baselineDocument = doc

    const { commit: challengerDraft } = await factories.createDraft({
      project,
      user,
    })
    challengerDocument = await factories.updateDocumentVersion({
      document: baselineDocument,
      commit: challengerDraft,
      content: factories.helpers.createPrompt({
        provider,
        content: CHALLENGER_CONTENT,
      }),
    })
    challengerCommit = challengerDraft

    vi.clearAllMocks()
  })

  describe('no active A/B test', () => {
    it('returns original commit, document and source when no active test exists', async () => {
      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).toBeNull()
      expect(result.effectiveCommit.id).toBe(headCommit.id)
      expect(result.effectiveDocument.id).toBe(baselineDocument.id)
      expect(result.effectiveSource).toBe(LogSources.User)
    })

    it('ignores shadow tests', async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'shadow',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      const test = createResult.value!
      await startDeploymentTest({ test })

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).toBeNull()
      expect(result.effectiveCommit.id).toBe(headCommit.id)
      expect(result.effectiveDocument.id).toBe(baselineDocument.id)
      expect(result.effectiveSource).toBe(LogSources.User)
    })

    it('ignores non-head commits when no matching test exists', async () => {
      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: challengerCommit,
        document: challengerDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).toBeNull()
      expect(result.effectiveCommit.id).toBe(challengerCommit.id)
      expect(result.effectiveDocument.id).toBe(challengerDocument.id)
      expect(result.effectiveSource).toBe(LogSources.User)
    })
  })

  describe('active A/B test with head commit', () => {
    let abTest: Awaited<ReturnType<typeof createDeploymentTest>>['value']

    beforeEach(async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      abTest = createResult.value!
      await startDeploymentTest({ test: abTest })
    })

    it('routes to baseline and returns baseline document', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).not.toBeNull()
      expect(result.abTest?.id).toBe(abTest!.id)
      expect(result.effectiveCommit.id).toBe(headCommit.id)
      expect(result.effectiveDocument.id).toBe(baselineDocument.id)
      expect(result.effectiveDocument.content).toContain(BASELINE_CONTENT)
      expect(result.effectiveSource).toBe(LogSources.User)
      expect(routeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: abTest!.id }),
        'user-123',
      )
    })

    it('routes to challenger and returns challenger document', async () => {
      vi.mocked(routeRequest).mockReturnValue('challenger')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).not.toBeNull()
      expect(result.abTest?.id).toBe(abTest!.id)
      expect(result.effectiveCommit.id).toBe(challengerCommit.id)
      expect(result.effectiveDocument.content).toContain(CHALLENGER_CONTENT)
      expect(result.effectiveSource).toBe(LogSources.ABTestChallenger)
      expect(routeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: abTest!.id }),
        'user-123',
      )
    })

    it('passes null customIdentifier to routeRequest when not provided', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
      })

      expect(routeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: abTest!.id }),
        undefined,
      )
    })

    it('passes null customIdentifier to routeRequest when explicitly null', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: null,
      })

      expect(routeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: abTest!.id }),
        null,
      )
    })
  })

  describe('active A/B test with challenger commit', () => {
    let abTest: Awaited<ReturnType<typeof createDeploymentTest>>['value']

    beforeEach(async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      abTest = createResult.value!
      await startDeploymentTest({ test: abTest })
    })

    it('routes to baseline and returns baseline document', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: challengerCommit,
        document: challengerDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).not.toBeNull()
      expect(result.abTest?.id).toBe(abTest!.id)
      expect(result.effectiveCommit.id).toBe(headCommit.id)
      expect(result.effectiveDocument.content).toContain(BASELINE_CONTENT)
      expect(result.effectiveSource).toBe(LogSources.User)
    })

    it('routes to challenger and returns challenger document', async () => {
      vi.mocked(routeRequest).mockReturnValue('challenger')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: challengerCommit,
        document: challengerDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).not.toBeNull()
      expect(result.abTest?.id).toBe(abTest!.id)
      expect(result.effectiveCommit.id).toBe(challengerCommit.id)
      expect(result.effectiveDocument.id).toBe(challengerDocument.id)
      expect(result.effectiveDocument.content).toContain(CHALLENGER_CONTENT)
      expect(result.effectiveSource).toBe(LogSources.ABTestChallenger)
    })
  })

  describe('edge cases', () => {
    it('handles case where test exists but commit does not match head or challenger', async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      const abTest = createResult.value!
      await startDeploymentTest({ test: abTest })

      const { commit: otherDraft } = await factories.createDraft({
        project,
        user,
      })
      const otherDoc = await factories.updateDocumentVersion({
        document: baselineDocument,
        commit: otherDraft,
        content: factories.helpers.createPrompt({
          provider,
          content: 'OTHER_CONTENT',
        }),
      })
      const otherCommit = otherDraft

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: otherCommit,
        document: otherDoc,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).toBeNull()
      expect(result.effectiveCommit.id).toBe(otherCommit.id)
      expect(result.effectiveDocument.id).toBe(otherDoc.id)
      expect(result.effectiveSource).toBe(LogSources.User)
    })
  })

  describe('commit matching optimization', () => {
    let abTest: Awaited<ReturnType<typeof createDeploymentTest>>['value']

    beforeEach(async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      abTest = createResult.value!
      await startDeploymentTest({ test: abTest })
    })

    it('returns original commit and document when routing to baseline and commit is already head', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.effectiveCommit.id).toBe(headCommit.id)
      expect(result.effectiveDocument.id).toBe(baselineDocument.id)
      expect(result.effectiveSource).toBe(LogSources.User)
    })

    it('returns original commit and document when routing to challenger and commit is already challenger', async () => {
      vi.mocked(routeRequest).mockReturnValue('challenger')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: challengerCommit,
        document: challengerDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.effectiveCommit.id).toBe(challengerCommit.id)
      expect(result.effectiveDocument.id).toBe(challengerDocument.id)
      expect(result.effectiveSource).toBe(LogSources.ABTestChallenger)
    })

    it('fetches different commit and document when routing requires commit change', async () => {
      vi.mocked(routeRequest).mockReturnValue('challenger')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.effectiveCommit.id).toBe(challengerCommit.id)
      expect(result.effectiveDocument.content).toContain(CHALLENGER_CONTENT)
      expect(result.effectiveSource).toBe(LogSources.ABTestChallenger)
    })
  })

  describe('multiple active tests', () => {
    let abTest1: Awaited<ReturnType<typeof createDeploymentTest>>['value']

    beforeEach(async () => {
      const createResult1 = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })
      expect(createResult1.ok).toBe(true)
      if (!createResult1.ok) return
      abTest1 = createResult1.value!

      await startDeploymentTest({ test: abTest1 })
    })

    it('finds the correct test when commit matches challenger commit', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: challengerCommit,
        document: challengerDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).not.toBeNull()
      expect(result.abTest?.id).toBe(abTest1!.id)
      expect(result.abTest?.challengerCommitId).toBe(challengerCommit.id)
    })

    it('finds test when commit is head commit', async () => {
      vi.mocked(routeRequest).mockReturnValue('challenger')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.User,
        customIdentifier: 'user-123',
      })

      expect(result.abTest).not.toBeNull()
      expect(result.abTest?.testType).toBe('ab')
      expect(result.abTest?.id).toBe(abTest1!.id)
    })
  })

  describe('source preservation', () => {
    let abTest: Awaited<ReturnType<typeof createDeploymentTest>>['value']

    beforeEach(async () => {
      const createResult = await createDeploymentTest({
        workspaceId: workspace.id,
        projectId: project.id,
        challengerCommitId: challengerCommit.id,
        testType: 'ab',
      })
      expect(createResult.ok).toBe(true)
      if (!createResult.ok) return

      abTest = createResult.value!
      await startDeploymentTest({ test: abTest })
    })

    it('preserves original source when routing to baseline', async () => {
      vi.mocked(routeRequest).mockReturnValue('baseline')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.Evaluation,
        customIdentifier: 'user-123',
      })

      expect(result.effectiveSource).toBe(LogSources.Evaluation)
    })

    it('changes source to ABTestChallenger when routing to challenger', async () => {
      vi.mocked(routeRequest).mockReturnValue('challenger')

      const result = await resolveAbTestRouting({
        workspaceId: workspace.id,
        projectId: project.id,
        commit: headCommit,
        document: baselineDocument,
        source: LogSources.Evaluation,
        customIdentifier: 'user-123',
      })

      expect(result.effectiveSource).toBe(LogSources.ABTestChallenger)
    })
  })
})
