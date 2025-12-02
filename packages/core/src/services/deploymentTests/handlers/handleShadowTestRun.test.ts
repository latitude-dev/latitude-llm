import { describe, expect, it, vi, beforeEach } from 'vitest'
import { enqueueShadowTestChallenger } from './handleShadowTestRun'
import type { DeploymentTest } from '../../../schema/models/types/DeploymentTest'
import type { Workspace } from '../../../schema/models/types/Workspace'
import type { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Result } from '../../../lib/Result'

const mockCreateDeploymentTestRun = vi.fn()

vi.mock('../createRun', () => ({
  createDeploymentTestRun: (...args: any[]) =>
    mockCreateDeploymentTestRun(...args),
}))

describe('handleShadowTestRun', () => {
  let mockWorkspace: Workspace
  let mockDocument: DocumentVersion
  let mockActiveTest: DeploymentTest

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateDeploymentTestRun.mockResolvedValue(Result.ok({} as any))

    mockWorkspace = {
      id: 1,
      name: 'Test Workspace',
    } as Workspace

    mockDocument = {
      documentUuid: 'doc-uuid',
      path: 'test/prompt.md',
    } as DocumentVersion

    mockActiveTest = {
      id: 1,
      uuid: 'test-uuid',
      workspaceId: 1,
      projectId: 1,
      documentUuid: 'doc-uuid',
      baselineCommitId: 1,
      challengerCommitId: 2,
      testType: 'shadow',
      trafficPercentage: 50,
      status: 'running',
    } as DeploymentTest
  })

  describe('enqueueShadowTestChallenger', () => {
    it('returns nil if no activeDeploymentTest provided', async () => {
      const result = await enqueueShadowTestChallenger({
        workspace: mockWorkspace,
        document: mockDocument,
        commit: {} as any,
        project: {} as any,
        activeDeploymentTest: undefined,
      })

      expect(Result.isOk(result)).toBe(true)
      if (!Result.isOk(result)) return
      expect(result.value).toBeUndefined()
    })

    it('returns nil if test type is not shadow', async () => {
      const abTest = { ...mockActiveTest, testType: 'ab' as const }

      const result = await enqueueShadowTestChallenger({
        workspace: mockWorkspace,
        document: mockDocument,
        commit: {} as any,
        project: {} as any,
        activeDeploymentTest: abTest,
      })

      expect(Result.isOk(result)).toBe(true)
      if (!Result.isOk(result)) return
      expect(result.value).toBeUndefined()
    })
  })
})
