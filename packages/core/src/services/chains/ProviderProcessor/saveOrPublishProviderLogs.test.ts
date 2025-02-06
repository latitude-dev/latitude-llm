import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Workspace } from '../../../browser'
import { LogSources, Providers } from '../../../constants'
import { publisher } from '../../../events/publisher'
import * as jobsModule from '../../../jobs'
import { generateUUIDIdentifier } from '../../../lib'
import * as createProviderLogService from '../../providerLogs/create'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from './saveOrPublishProviderLogs'

const publisherSpy = vi.spyOn(publisher, 'publishLater')
const createProviderLogSpy = vi.spyOn(
  createProviderLogService,
  'createProviderLog',
)

const mocks = vi.hoisted(() => ({
  queues: {
    defaultQueue: {
      jobs: {
        enqueueCreateProviderLogJob: vi.fn(),
      },
    },
  },
}))
const setupJobsSpy = vi.spyOn(jobsModule, 'setupJobs')
// @ts-expect-error - mock implementation
setupJobsSpy.mockResolvedValue(mocks.queues)

let data: ReturnType<typeof buildProviderLogDto>
let workspace: Workspace

describe('saveOrPublishProviderLogs', () => {
  beforeEach(async () => {
    const prompt = factories.helpers.createPrompt({
      provider: 'openai',
      model: 'gpt-4o',
    })
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      name: 'Default Project',
      documents: {
        foo: {
          content: prompt,
        },
      },
    })
    const { commit } = await factories.createDraft({
      project: setup.project,
      user: setup.user,
    })
    const { documentLog } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit,
    })
    workspace = setup.workspace
    // @ts-expect-error - mock implementation
    data = {
      workspaceId: setup.workspace.id,
      uuid: generateUUIDIdentifier(),
      source: LogSources.API,
      providerId: setup.providers[0]!.id,
      providerType: setup.providers[0]!.provider,
      documentLogUuid: documentLog.uuid,
      duration: 1000,
      generatedAt: new Date(),
      model: 'gpt-4o',
      config: { model: 'gpt-4o' },
      usage: { promptTokens: 3, completionTokens: 7, totalTokens: 10 },
      messages: [],
      toolCalls: [],
      responseText: 'MY TEXT',
    }
  })

  it('publishes event', async () => {
    await saveOrPublishProviderLogs({
      workspace,
      data,
      streamType: 'text',
      saveSyncProviderLogs: true,
      finishReason: 'stop',
      chainCompleted: true,
    })

    expect(publisherSpy).toHaveBeenCalledWith({
      type: 'aiProviderCallCompleted',
      data: {
        ...data,
        streamType: 'text',
        finishReason: 'stop',
        chainCompleted: true,
      },
    })
  })

  it('calls createProviderLog', async () => {
    await saveOrPublishProviderLogs({
      data,
      streamType: 'text',
      workspace,
      saveSyncProviderLogs: true,
      finishReason: 'stop',
      chainCompleted: true,
    })

    expect(createProviderLogSpy).toHaveBeenCalledWith({
      ...data,
      workspace,
      finishReason: 'stop',
    })
  })

  it('enqueues providerLog creation', async () => {
    await saveOrPublishProviderLogs({
      data,
      streamType: 'text',
      saveSyncProviderLogs: false,
      finishReason: 'stop',
      chainCompleted: true,
      workspace,
    })

    expect(
      mocks.queues.defaultQueue.jobs.enqueueCreateProviderLogJob,
    ).toHaveBeenCalledWith({
      ...data,
      workspace,
      generatedAt: data.generatedAt.toISOString(),
      finishReason: 'stop',
    })
  })
})
