import { Message } from '@latitude-data/compiler'
import { v4 } from 'uuid'

import {
  LogSources,
  ProviderApiKey,
  RunErrorCodes,
  StreamType,
} from '../../../browser'
import { StreamCommonData } from '../../../events/events'
import { TypedResult } from '../../../lib'
import { AIReturn, PartialConfig, StreamChunk } from '../../ai'
import { ChainError } from '../ChainErrors'
import { processStreamObject } from './processStreamObject'
import { processStreamText } from './processStreamText'
import { saveOrPublishProviderLogs } from './saveOrPublishProviderLogs'

export class ProviderProcessor {
  private apiProvider: ProviderApiKey
  private source: LogSources
  private documentLogUuid?: string
  private workspaceId: number
  private config: PartialConfig
  private messages: Message[]
  private saveSyncProviderLogs: boolean

  constructor({
    apiProvider,
    source,
    documentLogUuid,
    config,
    messages,
    saveSyncProviderLogs,
  }: {
    apiProvider: ProviderApiKey
    source: LogSources
    documentLogUuid?: string
    config: PartialConfig
    messages: Message[]
    saveSyncProviderLogs: boolean
  }) {
    this.apiProvider = apiProvider
    this.workspaceId = apiProvider.workspaceId
    this.source = source
    this.documentLogUuid = documentLogUuid
    this.config = config
    this.messages = messages
    this.saveSyncProviderLogs = saveSyncProviderLogs
  }

  /**
   * This method is responsible of 2 things
   * 1. Process the AI response
   * 2. Create a provider log if necessary (syncronous call or enqueue call)
   *
   * Provider log is created with AI error if present in the consumed stream
   */
  async call({
    aiResult,
    startTime,
    streamConsumedResult,
  }: {
    aiResult: Awaited<AIReturn<StreamType>>
    startTime: number
    streamConsumedResult: TypedResult<
      StreamChunk[],
      ChainError<RunErrorCodes.AIRunError>
    >
  }) {
    this.throwIfNotValidStreamType(aiResult)

    const { response, providerLogsData } = await this.processResponse({
      aiResult,
      startTime,
    })

    const providerLog = await saveOrPublishProviderLogs({
      streamType: aiResult.type,
      streamConsumedResult,
      data: providerLogsData,
      saveSyncProviderLogs: this.saveSyncProviderLogs,
    })

    return { ...response, providerLog }
  }

  private async processResponse({
    aiResult,
    startTime,
  }: {
    aiResult: Awaited<AIReturn<StreamType>>
    startTime: number
  }) {
    const commonData = await this.buildCommonData({ aiResult, startTime })

    if (aiResult.type === 'text') {
      return processStreamText({ aiResult, commonData })
    }

    return processStreamObject({ aiResult, commonData })
  }

  private async buildCommonData({
    aiResult,
    startTime,
  }: {
    aiResult: Awaited<AIReturn<StreamType>>
    startTime: number
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
      duration: endTime - startTime,
      generatedAt: new Date(),
      model: this.config.model,
      config: this.config,
      messages: this.messages,
      usage: await aiResult.data.usage,
    }
  }

  private throwIfNotValidStreamType(aiResult: AIReturn<StreamType>) {
    const { type } = aiResult
    const invalidType = type !== 'text' && type !== 'object'
    if (!invalidType) return

    throw new ChainError({
      code: RunErrorCodes.UnsupportedProviderResponseTypeError,
      message: `Invalid stream type ${type} result is not a textStream or objectStream`,
    })
  }
}
