import { Message } from '@latitude-data/compiler'
import { v4 } from 'uuid'

import { LogSources, ProviderApiKey, StreamType } from '../../../browser'
import { StreamCommonData } from '../../../events/events'
import { AIReturn, PartialConfig } from '../../ai'
import { processStreamObject } from './processStreamObject'
import { processStreamText } from './processStreamText'

export class ProviderProcessor {
  private startTime: number
  private apiProvider: ProviderApiKey
  private source: LogSources
  private documentLogUuid?: string
  private workspaceId: number
  private config: PartialConfig
  private messages: Message[]

  constructor({
    apiProvider,
    source,
    documentLogUuid,
    config,
    messages,
  }: {
    apiProvider: ProviderApiKey
    source: LogSources
    documentLogUuid?: string
    config: PartialConfig
    messages: Message[]
  }) {
    this.startTime = Date.now()
    this.apiProvider = apiProvider
    this.workspaceId = apiProvider.workspaceId
    this.source = source
    this.documentLogUuid = documentLogUuid
    this.config = config
    this.messages = messages
  }

  /**
   * This method is responsible of 2 things
   * 1. Process the AI result and return the response for streaming
   * 2. Create a provider log if necessary (syncronous call or enqueue call)
   */
  async call({
    aiResult,
    saveSyncProviderLogs,
  }: {
    aiResult: Awaited<AIReturn<StreamType>>
    saveSyncProviderLogs: boolean
  }) {
    const common = await this.buildCommonData({ aiResult })
    if (aiResult.type === 'text') {
      const text = await processStreamText({
        aiResult,
        commonData: common,
        saveSyncProviderLogs,
      })
      return text
    } else if (aiResult.type === 'object') {
      const object = await processStreamObject({
        aiResult,
        commonData: common,
        saveSyncProviderLogs,
      })
      return object
    } else {
      // This should never happen
      throw new Error(
        'Invalid stream type AI result is not a textStream or objectStream',
      )
    }
  }

  async buildCommonData({
    aiResult,
  }: {
    aiResult: Awaited<AIReturn<StreamType>>
  }): Promise<StreamCommonData> {
    const endTime = Date.now()
    return {
      uuid: v4(),

      // Data
      workspaceId: this.workspaceId,
      source: this.source,
      providerId: this.apiProvider.id,
      providerType: this.apiProvider.provider,
      documentLogUuid: this.documentLogUuid,

      // AI
      duration: endTime - this.startTime,
      generatedAt: new Date(),
      model: this.config.model,
      config: this.config,
      messages: this.messages,
      usage: await aiResult.data.usage,
    }
  }
}
