import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { ManualInstrumentation } from '$telemetry/instrumentations/manual'
import {
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_STOP,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS,
} from '@latitude-data/constants'
import type * as latitude from '@latitude-data/sdk'
import * as otel from '@opentelemetry/api'
import { context } from '@opentelemetry/api'
import type * as promptl from 'promptl-ai'
import { v4 as uuid } from 'uuid'

export type LatitudeInstrumentationOptions = {
  module: typeof latitude.Latitude
  completions?: boolean
}

export class LatitudeInstrumentation implements BaseInstrumentation {
  private readonly options: LatitudeInstrumentationOptions
  private readonly telemetry: ManualInstrumentation

  constructor(tracer: otel.Tracer, options: LatitudeInstrumentationOptions) {
    this.telemetry = new ManualInstrumentation(tracer)
    this.options = options
  }

  isEnabled() {
    return this.telemetry.isEnabled()
  }

  enable() {
    this.options.module.instrument(this)
    this.telemetry.enable()
  }

  disable() {
    this.telemetry.disable()
    this.options.module.uninstrument()
  }

  private countTokens<M extends promptl.AdapterMessageType>(messages: M[]) {
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

  async wrapRenderChain<F extends latitude.Latitude['renderChain']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { prompt, parameters } = args[0]

    const $prompt = this.telemetry.prompt(context.active(), {
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

  async wrapRenderStep<F extends latitude.Latitude['renderStep']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const $step = this.telemetry.step(context.active())

    let result
    try {
      result = await context.with(
        $step.context,
        async () => await ((fn as any)(...args) as ReturnType<F>),
      )
    } catch (error) {
      $step.fail(error as Error)
      throw error
    }

    $step.end()

    return result
  }

  async wrapRenderCompletion<F extends latitude.Latitude['renderCompletion']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    if (!this.options.completions) {
      return await ((fn as any)(...args) as ReturnType<F>)
    }

    const { provider, config, messages } = args[0]
    const model = (config.model as string) || 'unknown'

    const $completion = this.telemetry.completion(context.active(), {
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
          ? GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS
          : GEN_AI_RESPONSE_FINISH_REASON_VALUE_STOP,
    })

    return result
  }

  async wrapRenderTool<F extends latitude.Latitude['renderTool']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { toolRequest } = args[0]

    const $tool = this.telemetry.tool(context.active(), {
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
