import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import * as factories from '../../../../tests/factories'
import { computeLatteCredits } from './compute'

describe('computeLatteCredits', () => {
  let workspace: Workspace

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const { workspace: w } = await factories.createWorkspace()
    workspace = w
  })

  it('succeeds', async () => {
    expect(
      await computeLatteCredits({
        usage: {
          inputTokens: 100,
          outputTokens: 100,
          promptTokens: 100,
          completionTokens: 100,
          totalTokens: 200,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).toEqual(1)

    expect(
      await computeLatteCredits({
        usage: {
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
          promptTokens: 1_000_000,
          completionTokens: 1_000_000,
          totalTokens: 2_000_000,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).toEqual(10)

    expect(
      await computeLatteCredits({
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).toEqual(1)

    expect(
      await computeLatteCredits({
        usage: {
          inputTokens: -100,
          outputTokens: -100,
          promptTokens: -100,
          completionTokens: -100,
          totalTokens: -200,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).toEqual(1)
  })
})
