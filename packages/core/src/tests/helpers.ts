import { vi } from 'vitest'
import * as factories from './factories'
import { DEFAULT_COPILOT_GENERATE_TOOL_RESPONSES_PATH } from '../jobs/job-definitions/documents/runDocumentAtCommitWithAutoToolResponses/getCopilotData'
import { Providers } from '@latitude-data/constants'
import { mergeCommit } from '../services/commits'
import { Result } from '../lib'

export async function testConsumeStream(stream: ReadableStream) {
  const reader = stream.getReader()

  let done = false
  const events = []
  while (!done) {
    const { done: _done, value } = await reader.read()
    done = _done

    if (value) {
      events.push(value)
    }
  }

  return { done, value: events }
}

export async function mockToolRequestsCopilot() {
  const { workspace } = await factories.createWorkspace()
  const copilot = await factories.createProject({
    workspace,
    providers: [{ name: 'MyOpenAI', type: Providers.OpenAI }],
  })

  const { commit } = await factories.createDraft({
    project: copilot.project,
    user: copilot.user,
  })
  const provider = copilot.providers[0]!
  const { documentVersion } = await factories.createDocumentVersion({
    workspace,
    user: copilot.user,
    commit,
    path: DEFAULT_COPILOT_GENERATE_TOOL_RESPONSES_PATH,
    content: `
      ---
      provider: ${provider.name}
      model: 'gpt-4o-mini'
      ---
    `,
  })
  const mergedCommit = await mergeCommit(commit).then((r) => r.unwrap())

  vi.doMock(
    '../../src/jobs/job-definitions/documents/runDocumentAtCommitWithAutoToolResponses/getCopilotData',
    async (originalMod) => {
      const mod = (await originalMod()) as typeof import('@latitude-data/env')
      return {
        ...mod,
        getCopilotDataForGenerateToolResponses: async () =>
          Result.ok({
            workspace,
            commit: mergedCommit,
            document: documentVersion,
          }),
      }
    },
  )
}
