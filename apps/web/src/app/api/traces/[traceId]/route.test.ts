import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSpan, createWorkspace } from '@latitude-data/core/factories'
import { CompletionSpanMetadata, SpanType } from '@latitude-data/constants'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { SpanMetadatasRepository } from '@latitude-data/core/repositories'
import { Result } from '@latitude-data/core/lib/Result'

import { GET } from './route'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    captureException: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))
vi.mock('$/helpers/captureException', () => ({
  captureException: mocks.captureException,
}))

describe('GET /api/traces/[traceId]', () => {
  let user: User
  let workspace: Workspace

  beforeEach(async () => {
    vi.clearAllMocks()
    const setup = await createWorkspace()
    user = setup.userData as User
    workspace = setup.workspace
  })

  function buildRequest(traceId: string) {
    return new NextRequest(`http://localhost:3000/api/traces/${traceId}`)
  }

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)
      const request = buildRequest('some-trace-id')

      const response = await GET(request, {
        params: { traceId: 'some-trace-id' },
        workspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    it('should return 422 for non-existent trace', async () => {
      const request = buildRequest('non-existent-trace')

      const response = await GET(request, {
        params: { traceId: 'non-existent-trace' },
        workspace,
      } as any)

      expect(response.status).toBe(422)
    })

    it('should return assembled trace structure', async () => {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: 'test-trace-1',
        type: SpanType.Prompt,
        name: 'test-prompt',
      })

      const request = buildRequest(span.traceId)

      const response = await GET(request, {
        params: { traceId: span.traceId },
        workspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.id).toBe(span.traceId)
      expect(data.children).toHaveLength(1)
      expect(data.children[0].id).toBe(span.id)
    })

    it('should return trace with completion span metadata for messages', async () => {
      const mockMetadata = {
        input: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        output: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hi there!' }],
          },
        ],
        provider: 'openai',
        model: 'gpt-4',
        configuration: {},
      } as unknown as CompletionSpanMetadata

      vi.spyOn(SpanMetadatasRepository.prototype, 'get').mockResolvedValue(
        Result.ok(mockMetadata),
      )

      const startTime = new Date()
      const promptSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'test-trace-messages',
        type: SpanType.Prompt,
        name: 'prompt',
        startedAt: startTime,
        duration: 2000,
      })

      const completionSpan = await createSpan({
        workspaceId: workspace.id,
        traceId: 'test-trace-messages',
        parentId: promptSpan.id,
        type: SpanType.Completion,
        name: 'completion',
        startedAt: new Date(startTime.getTime() + 100),
        duration: 1000,
      })

      const request = buildRequest('test-trace-messages')

      const response = await GET(request, {
        params: { traceId: 'test-trace-messages' },
        workspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.id).toBe('test-trace-messages')
      expect(data.children).toHaveLength(1)

      const promptChild = data.children[0]
      expect(promptChild.id).toBe(promptSpan.id)
      expect(promptChild.children).toHaveLength(1)

      const completionChild = promptChild.children[0]
      expect(completionChild.id).toBe(completionSpan.id)
      expect(completionChild.type).toBe(SpanType.Completion)
      expect(completionChild.metadata).toBeDefined()
      expect(completionChild.metadata.input).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ])
      expect(completionChild.metadata.output).toEqual([
        { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
      ])
    })

    it('should not return metadata for other workspaces traces', async () => {
      const { workspace: otherWorkspace } = await createWorkspace({
        name: 'other-workspace',
      })

      await createSpan({
        workspaceId: otherWorkspace.id,
        traceId: 'other-workspace-trace',
        type: SpanType.Prompt,
        name: 'other-prompt',
      })

      const request = buildRequest('other-workspace-trace')

      const response = await GET(request, {
        params: { traceId: 'other-workspace-trace' },
        workspace,
      } as any)

      expect(response.status).toBe(422)
    })
  })
})
