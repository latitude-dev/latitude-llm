import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { ManualInstrumentation } from '$telemetry/instrumentations/manual'
import { VALUES } from '@latitude-data/constants'
import type { Latitude } from '@latitude-data/sdk'
import type { Tracer } from '@opentelemetry/api'
import { context } from '@opentelemetry/api'
import type { AdapterMessageType } from 'promptl-ai'
import { v4 as uuid } from 'uuid'

export type LatitudeInstrumentationOptions = {
  module: typeof Latitude
  completions?: boolean
}

export class LatitudeInstrumentation implements BaseInstrumentation {
  private readonly options: LatitudeInstrumentationOptions
  private readonly manualTelemetry: ManualInstrumentation

  constructor(tracer: Tracer, options: LatitudeInstrumentationOptions) {
    this.manualTelemetry = new ManualInstrumentation(tracer)
    this.options = options
  }

  isEnabled() {
    return this.manualTelemetry.isEnabled()
  }

  enable() {
    this.options.module.instrument(this)
    this.manualTelemetry.enable()
  }

  disable() {
    this.manualTelemetry.disable()
    this.options.module.uninstrument()
  }

  private countTokens<M extends AdapterMessageType>(messages: M[]) {
    let length = 0

    for (const message of messages) {
      if (!('content' in message)) continue
      if (typeof message.content === 'string') {
        length += message.content.length
      } else if (Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.type === 'text') {
            length += content.text.length
          }
        }
      }
    }

    // Note: this is an estimation to not bundle a tokenizer
    return Math.ceil(length / 4)
  }

  async wrapRenderChain<F extends Latitude['renderChain']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { prompt, parameters } = args[0]

    const $prompt = this.manualTelemetry.prompt(context.active(), {
      documentLogUuid: uuid(),
      versionUuid: prompt.versionUuid,
      promptUuid: prompt.uuid,
      template: prompt.content,
      parameters: parameters,
    })

    let result
    try {
      result = await context.with(
        $prompt.context,
        async () => await ((fn as any)(...args) as ReturnType<F>),
      )
    } catch (error) {
      $prompt.fail(error as Error)
      throw error
    }

    $prompt.end()

    return result
  }

  async wrapRenderCompletion<F extends Latitude['renderCompletion']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    if (!this.options.completions) {
      return await ((fn as any)(...args) as ReturnType<F>)
    }

    const { provider, config, messages } = args[0]
    const model = (config.model as string) || 'unknown'

    const $completion = this.manualTelemetry.completion(context.active(), {
      name: `${provider} / ${model}`,
      provider: provider,
      model: model,
      configuration: config,
      input: messages as Record<string, unknown>[],
    })

    let result
    try {
      result = await context.with(
        $completion.context,
        async () => await ((fn as any)(...args) as ReturnType<F>),
      )
    } catch (error) {
      $completion.fail(error as Error)
      throw error
    }

    // Note: enhance, this is just an estimation
    const promptTokens = this.countTokens(messages)
    const completionTokens = this.countTokens(result.messages)

    $completion.end({
      output: result.messages as Record<string, unknown>[],
      tokens: {
        prompt: promptTokens,
        cached: 0,
        reasoning: 0,
        completion: completionTokens,
      },
      finishReason:
        result.toolRequests.length > 0
          ? VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.toolCalls
          : VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.stop,
    })

    return result
  }

  async wrapRenderTool<F extends Latitude['renderTool']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { toolRequest } = args[0]

    const $tool = this.manualTelemetry.tool(context.active(), {
      name: toolRequest.toolName,
      call: {
        id: toolRequest.toolCallId,
        arguments: toolRequest.toolArguments,
      },
    })

    let result
    try {
      result = await context.with(
        $tool.context,
        async () => await ((fn as any)(...args) as ReturnType<F>),
      )
    } catch (error) {
      $tool.fail(error as Error)
      throw error
    }

    $tool.end({
      result: {
        value: result.result,
        isError: result.isError,
      },
    })

    return result
  }
}
