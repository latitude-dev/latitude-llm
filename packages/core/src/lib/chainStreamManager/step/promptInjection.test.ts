import { describe, expect, it, vi } from 'vitest'
import * as factories from '@latitude-data/core/factories'
import { performPromptInjection } from './promptInjection'
import { Providers } from '@latitude-data/constants'
import { getAgentToolName } from '../../../services/agents/helpers'
import { BadRequestError, NotFoundError } from '../../errors'
import { beforeEach } from 'node:test'
import * as agentsAsTools from '../../../services/agents/agentsAsTools'

describe('promptInjection', () => {
  describe('agentsAsTools', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('injects agents as tools', async () => {
      const { workspace, documents, commit } = await factories.createProject({
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          main: factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { agents: ['agents/agent1'] },
          }),
          'agents/agent1': factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { type: 'agent' },
          }),
        },
      })

      const document = documents.find((doc) => doc.path === 'main')!
      const result = await performPromptInjection({
        workspace,
        promptSource: {
          document,
          commit,
        },
        messages: [],
        config: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          agents: ['agents/agent1'],
        },
      })

      expect(result.ok).toBeTruthy()
      const { config } = result.unwrap()

      const toolNames = Object.keys(config.tools ?? [])
      expect(toolNames).toEqual([getAgentToolName('agents/agent1')])
    })

    it('injects agent parameters as tool parameters', async () => {
      const { workspace, documents, commit } = await factories.createProject({
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          main: factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { agents: ['agents/agent1'] },
          }),
          'agents/agent1': factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { type: 'agent' },
            content: '{{ param1 }}',
          }),
        },
      })

      const document = documents.find((doc) => doc.path === 'main')!
      const result = await performPromptInjection({
        workspace,
        promptSource: {
          document,
          commit,
        },
        messages: [],
        config: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          agents: ['agents/agent1'],
        },
      })

      expect(result.ok).toBeTruthy()
      const { config } = result.unwrap()

      const tool = config.tools![getAgentToolName('agents/agent1')]!
      expect(tool).toEqual({
        description: expect.any(String),
        parameters: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
          required: ['param1'],
          additionalProperties: false,
        },
      })
    })

    it('does not inject agents as tools if not in config', async () => {
      const { workspace, documents, commit } = await factories.createProject({
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          main: factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { agents: ['agents/agent1'] },
          }),
          'agents/agent1': factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { type: 'agent' },
          }),
          'agents/agent2': factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { type: 'agent' },
          }),
        },
      })

      const document = documents.find((doc) => doc.path === 'main')!
      const result = await performPromptInjection({
        workspace,
        promptSource: {
          document,
          commit,
        },
        messages: [],
        config: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          agents: ['agents/agent1'],
        },
      })

      expect(result.ok).toBeTruthy()
      const { config } = result.unwrap()

      const toolNames = Object.keys(config.tools ?? [])
      expect(toolNames).toEqual([getAgentToolName('agents/agent1')])
    })

    it('fails when included agent does not exist', async () => {
      const { workspace, documents, commit } = await factories.createProject({
        skipMerge: true,
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          main: factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { agents: ['agents/agent1'] },
          }),
        },
      })

      const document = documents.find((doc) => doc.path === 'main')!
      const result = await performPromptInjection({
        workspace,
        promptSource: {
          document,
          commit,
        },
        messages: [],
        config: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          agents: ['agents/agent1'],
        },
      })

      expect(result.ok).toBeFalsy()
      expect(result.error).toEqual(
        new NotFoundError(`Documents not found: 'agents/agent1'`),
      )
    })

    it('fails when included agent is not an agent', async () => {
      const { workspace, documents, commit } = await factories.createProject({
        skipMerge: true,
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          main: factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { agents: ['agents/agent1'] },
          }),
          'agents/agent1': factories.helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })

      const document = documents.find((doc) => doc.path === 'main')!
      const result = await performPromptInjection({
        workspace,
        promptSource: {
          document,
          commit,
        },
        messages: [],
        config: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          agents: ['agents/agent1'],
        },
      })

      expect(result.ok).toBeFalsy()
      expect(result.error).toEqual(
        new BadRequestError(`Document 'agents/agent1' is not an agent`),
      )
    })

    it('does not fetch and scan documents if no agents are included', async () => {
      vi.spyOn(agentsAsTools, 'buildAgentsAsToolsDefinition')

      const { workspace, documents, commit } = await factories.createProject({
        providers: [{ name: 'openai', type: Providers.OpenAI }],
        documents: {
          main: factories.helpers.createPrompt({
            provider: 'openai',
          }),
          'agents/agent1': factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { type: 'agent' },
          }),
          'agents/agent2': factories.helpers.createPrompt({
            provider: 'openai',
            extraConfig: { type: 'agent' },
          }),
        },
      })

      const document = documents.find((doc) => doc.path === 'main')!
      const result = await performPromptInjection({
        workspace,
        promptSource: {
          document,
          commit,
        },
        messages: [],
        config: {
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      })

      expect(result.ok).toBeTruthy()
      expect(agentsAsTools.buildAgentsAsToolsDefinition).not.toHaveBeenCalled()
    })
  })
})
