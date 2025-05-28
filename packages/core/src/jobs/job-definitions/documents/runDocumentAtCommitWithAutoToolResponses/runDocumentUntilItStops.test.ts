import { describe, it, expect, vi } from 'vitest'
import { AGENT_RETURN_TOOL_NAME } from '@latitude-data/constants'
import { runDocumentAtCommit as runDocumentAtCommitFn } from '../../../../services/commits/runDocumentAtCommit'
import { respondToToolCalls } from './respondToToolCalls'
import { runDocumentUntilItStops } from './runDocumentUntilItStops'
import { Result } from './../../../../lib/Result'

// Mock both modules
vi.mock('../../../../services/commits/runDocumentAtCommit')
vi.mock('./respondToToolCalls')

const runDocumentAtCommitFnSpy = vi.mocked(runDocumentAtCommitFn)
const respondToToolCallsSpy = vi.mocked(respondToToolCalls)

describe('runDocumentUntilItStops', () => {
  it('does not call respondToToolCalls with agent response tool', async () => {
    const fakePayload = {
      error: Promise.resolve<Error | null>(null),
      toolCalls: Promise.resolve([
        {
          id: 'some-id',
          name: AGENT_RETURN_TOOL_NAME,
          arguments: {
            result: 'This is a response from the agent',
          },
        },
      ]),
      errorableUuid: 'some-uuid',
    }
    // @ts-ignore – payload is not the expected type, but we are mocking the function
    runDocumentAtCommitFnSpy.mockResolvedValueOnce(Result.ok(fakePayload))

    const props = {
      hasToolCalls: false as const,
      autoRespondToolCalls: true,
      data: {
        workspace: {} as any,
        commit: {} as any,
        document: {} as any,
        customPrompt: undefined,
        experiment: undefined,
        copilot: {} as any,
        documentLogUuid: 'unused',
        source: 'TEST' as any,
      },
    }

    // @ts-ignore
    const result = await runDocumentUntilItStops(props, runDocumentUntilItStops)

    expect(runDocumentAtCommitFnSpy).toHaveBeenCalledOnce()
    expect(runDocumentAtCommitFnSpy).toHaveBeenCalledWith(props.data)
    expect(respondToToolCallsSpy).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(fakePayload)
  })
})
