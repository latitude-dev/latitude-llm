import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AbortedError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { proposeFactory } from './propose'

const mocks = vi.hoisted(() => ({
  scanDocumentContent: vi.fn(),
  buildProvidersMap: vi.fn(),
  runCopilot: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}))

vi.mock('../../documents', () => ({
  scanDocumentContent: mocks.scanDocumentContent,
}))

vi.mock('../../providerApiKeys/buildMap', () => ({
  buildProvidersMap: mocks.buildProvidersMap,
}))

vi.mock('../../copilot', () => ({
  runCopilot: mocks.runCopilot,
}))

vi.mock('../../../cache', () => ({
  cache: vi.fn().mockResolvedValue({
    get: (...args: unknown[]) => mocks.cacheGet(...args),
    set: (...args: unknown[]) => mocks.cacheSet(...args),
  }),
}))

vi.mock('@latitude-data/env', () => ({
  env: {
    COPILOT_PROMPT_OPTIMIZATION_PROPOSER_PATH: 'test/proposer/path',
  },
}))

const baseDocument = {
  id: 1,
  documentUuid: 'doc-uuid',
  path: 'test-prompt',
  content: '---\nprovider: openai\nmodel: gpt-4o\n---\nHello',
  commitId: 1,
  workspaceId: 1,
} as any

const baseCommit = { id: 1, uuid: 'commit-uuid' } as any
const baseWorkspace = { id: 1 } as any

const baseOptimization = {
  id: 1,
  uuid: 'opt-uuid',
  configuration: { scope: 'full' },
} as any

describe('proposeFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.buildProvidersMap.mockResolvedValue(new Map())
    mocks.scanDocumentContent.mockResolvedValue(
      Result.ok({
        parameters: new Set<string>(),
        config: { provider: 'openai', model: 'gpt-4o' },
        instructions: 'test instructions',
        errors: [],
      }),
    )
    mocks.cacheGet.mockResolvedValue(null)
    mocks.runCopilot.mockResolvedValue(
      Result.ok({ prompt: 'optimized prompt' }),
    )
  })

  describe('cancellation', () => {
    it('throws AbortedError when signal is already aborted', async () => {
      const propose = await proposeFactory({
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const abortController = new AbortController()
      abortController.abort()

      await expect(
        propose({
          prompt: baseDocument.content,
          context: [],
          abortSignal: abortController.signal,
        }),
      ).rejects.toThrowError(AbortedError)

      expect(mocks.scanDocumentContent).not.toHaveBeenCalled()
      expect(mocks.runCopilot).not.toHaveBeenCalled()
    })

    it('passes abortSignal to runCopilot', async () => {
      const propose = await proposeFactory({
        optimization: baseOptimization,
        document: baseDocument,
        commit: baseCommit,
        workspace: baseWorkspace,
      })

      const abortController = new AbortController()

      await propose({
        prompt: baseDocument.content,
        context: [],
        abortSignal: abortController.signal,
      })

      expect(mocks.runCopilot).toHaveBeenCalledWith(
        expect.objectContaining({
          abortSignal: abortController.signal,
        }),
      )
    })
  })
})
