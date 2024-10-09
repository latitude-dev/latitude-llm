import { Message } from '@latitude-data/compiler'

import {
  LogSources,
  ProviderApiKey,
  RunErrorCodes,
  StreamType,
} from '../../../browser'
import { StreamCommonData } from '../../../events/events'
import { generateUUIDIdentifier, Result } from '../../../lib'
import { AIReturn, PartialConfig } from '../../ai'
import { ChainError } from '../ChainErrors'
import { StreamConsumeReturn } from '../ChainStreamConsumer/consumeStream'
import { processStreamObject } from './processStreamObject'
import { processStreamText } from './processStreamText'
import { saveOrPublishProviderLogs } from './saveOrPublishProviderLogs'

export class ProviderProcessor {
  private apiProvider: ProviderApiKey
  private source: LogSources
  private workspaceId: number
  private config: PartialConfig
  private messages: Message[]
  private saveSyncProviderLogs: boolean
  private errorableUuid: string | undefined

  constructor({
    apiProvider,
    source,
    config,
    messages,
    saveSyncProviderLogs,
    errorableUuid,
  }: {
    apiProvider: ProviderApiKey
    source: LogSources
    config: PartialConfig
    messages: Message[]
    saveSyncProviderLogs: boolean
    errorableUuid?: string
  }) {
    this.apiProvider = apiProvider
    this.workspaceId = apiProvider.workspaceId
    this.source = source
    this.config = config
    this.messages = messages
    this.saveSyncProviderLogs = saveSyncProviderLogs
    this.errorableUuid = errorableUuid
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
    finishReason,
  }: {
    aiResult: Awaited<AIReturn<StreamType>>
    startTime: number
    finishReason: StreamConsumeReturn['finishReason']
  }) {
    const checkResult = this.checkValidType(aiResult)
    if (checkResult.error) return checkResult

    const { response, providerLogsData } = await this.processResponse({
      aiResult,
      startTime,
    })

    const providerLog = await saveOrPublishProviderLogs({
      streamType: aiResult.type,
      finishReason,
      data: providerLogsData,
      saveSyncProviderLogs: this.saveSyncProviderLogs,
    })

    return Result.ok({ ...response, providerLog })
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
    const duration = endTime - startTime
    return {
      uuid: generateUUIDIdentifier(),

      // AI Provider Data
      workspaceId: this.workspaceId,
      source: this.source,
      providerId: this.apiProvider.id,
      providerType: this.apiProvider.provider,
      // FIXME: This should be polymorphic
      // https://github.com/latitude-dev/latitude-llm/issues/229
      documentLogUuid: this.errorableUuid,

      // AI
      duration,
      generatedAt: new Date(),
      model: this.config.model,
      config: this.config,
      messages: this.messages,
      usage: await aiResult.data.usage,
    }
  }

  private checkValidType(aiResult: AIReturn<StreamType>) {
    const { type } = aiResult
    const invalidType = type !== 'text' && type !== 'object'
    if (!invalidType) return Result.nil()

    return Result.error(
      new ChainError({
        code: RunErrorCodes.UnsupportedProviderResponseTypeError,
        message: `Invalid stream type ${type} result is not a textStream or objectStream`,
      }),
    )
  }
}
