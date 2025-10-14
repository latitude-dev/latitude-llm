import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers } from '@latitude-data/constants'
import {
  createDocumentVersion,
  createDraft,
  createProject,
} from '../../../tests/factories'
import { RunDocumentChecker } from './index'

const dummyDocContent = `
---
provider: openai
model: gpt-4o
---

Hello, world!
`

async function buildData() {
  const { workspace, user, project } = await createProject({
    providers: [{ type: Providers.OpenAI, name: 'openai' }],
    documents: {
      doc1: dummyDocContent,
    },
  })

  const { commit } = await createDraft({ project, user })

  const { documentVersion: document } = await createDocumentVersion({
    workspace,
    user,
    commit,
    path: 'path/to/document',
    content: dummyDocContent,
  })

  return {
    workspace,
    document,
    commit,
    user,
  }
}

describe('RunDocumentChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('with userMessage', () => {
    it('injects userMessage into the prompt', async () => {
      const { document } = await buildData()
      const userMessage = 'Please answer in French'

      const checker = new RunDocumentChecker({
        document,
        errorableUuid: 'test-uuid',
        prompt: dummyDocContent,
        parameters: {},
        userMessage,
      })

      const result = await checker.call()

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()

      // The chain should be created successfully with the injected user message
      const chain = result.unwrap().chain
      expect(chain).toBeDefined()

      // Get the first step to check the messages
      const stepResult = await chain.step()
      expect(stepResult.messages).toBeDefined()

      // Check that the user message was injected
      const userMessages = stepResult.messages.filter(
        (msg) => msg.role === 'user',
      )
      expect(userMessages).toHaveLength(1)

      // The content is an array of content objects, check the text content
      const userContent = userMessages[0]?.content?.[0]
      expect(userContent).toBeDefined()
      const textContent =
        userContent && userContent.type === 'text' ? userContent.text : ''
      expect(textContent).toContain('Please answer in French')
    })

    it('works without userMessage', async () => {
      const { document } = await buildData()

      const checker = new RunDocumentChecker({
        document,
        errorableUuid: 'test-uuid',
        prompt: dummyDocContent,
        parameters: {},
      })

      const result = await checker.call()

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()

      const chain = result.unwrap().chain
      expect(chain).toBeDefined()

      const stepResult = await chain.step()
      expect(stepResult.messages).toBeDefined()

      const userMessages = stepResult.messages.filter(
        (msg) => msg.role === 'user',
      )
      expect(userMessages).toHaveLength(0)
    })

    it('handles empty userMessage', async () => {
      const { document } = await buildData()

      const checker = new RunDocumentChecker({
        document,
        errorableUuid: 'test-uuid',
        prompt: dummyDocContent,
        parameters: {},
        userMessage: '', // Empty string
      })

      const result = await checker.call()

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()

      const chain = result.unwrap().chain
      expect(chain).toBeDefined()

      const stepResult = await chain.step()
      expect(stepResult.messages).toBeDefined()

      const userMessages = stepResult.messages.filter(
        (msg) => msg.role === 'user',
      )
      expect(userMessages).toHaveLength(0)
    })
  })

  describe('with file parameters', () => {
    it('handles undefined file parameter values in config', async () => {
      const { document } = await buildData()

      // Create a prompt with a file parameter that will be undefined
      const promptWithFileParam = `
---
provider: openai
model: gpt-4o
parameters:
  myFile:
    type: file
    description: A file parameter
---

Hello, world!
`

      const checker = new RunDocumentChecker({
        document,
        errorableUuid: 'test-uuid',
        prompt: promptWithFileParam,
        parameters: {
          myFile: undefined, // Explicitly undefined file parameter value
        },
      })

      const result = await checker.call()

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()

      const chain = result.unwrap().chain
      expect(chain).toBeDefined()

      const stepResult = await chain.step()
      expect(stepResult.messages).toBeDefined()
    })

    it('handles missing file parameter values in config', async () => {
      const { document } = await buildData()

      // Create a prompt with a file parameter that is not provided
      const promptWithFileParam = `
---
provider: openai
model: gpt-4o
parameters:
  myFile:
    type: file
    description: A file parameter
---

Hello, world!
`

      const checker = new RunDocumentChecker({
        document,
        errorableUuid: 'test-uuid',
        prompt: promptWithFileParam,
        parameters: {}, // No file parameter provided
      })

      const result = await checker.call()

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()

      const chain = result.unwrap().chain
      expect(chain).toBeDefined()

      const stepResult = await chain.step()
      expect(stepResult.messages).toBeDefined()
    })

    it('handles file parameters with empty string url', async () => {
      const { document } = await buildData()

      // Create a prompt with a file parameter that is not provided
      const promptWithFileParam = `
---
provider: openai
model: gpt-4o
parameters:
  myFile:
    type: file
    description: A file parameter
---

Hello, world!
`

      const checker = new RunDocumentChecker({
        document,
        errorableUuid: 'test-uuid',
        prompt: promptWithFileParam,
        parameters: { myFile: '' }, // No file parameter provided
      })

      const result = await checker.call()

      expect(result.error).toBeUndefined()
      expect(result.value).toBeDefined()

      const chain = result.unwrap().chain
      expect(chain).toBeDefined()

      const stepResult = await chain.step()
      expect(stepResult.messages).toBeDefined()
    })
  })
})
