import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { ManualInstrumentation } from '$telemetry/instrumentations/manual'
import {
  ATTR_GEN_AI_REQUEST_PARAMETERS,
  ATTR_GEN_AI_REQUEST_TEMPLATE,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_STOP,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS,
  SpanSource,
  TraceContext,
} from '@latitude-data/constants'
import type * as latitude from '@latitude-data/sdk'
import * as otel from '@opentelemetry/api'
import { context, propagation } from '@opentelemetry/api'
import type * as promptl from 'promptl-ai'

export type LatitudeInstrumentationOptions = {
  module: typeof latitude.Latitude
  completions?: boolean
}

export class LatitudeInstrumentation implements BaseInstrumentation {
  private readonly options: LatitudeInstrumentationOptions
  private readonly telemetry: ManualInstrumentation

  constructor(
    source: SpanSource,
    tracer: otel.Tracer,
    options: LatitudeInstrumentationOptions,
  ) {
    this.telemetry = new ManualInstrumentation(source, tracer)
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

  withTraceContext<F extends () => ReturnType<F>>(
    ctx: TraceContext,
    fn: F,
  ): ReturnType<F> {
    return context.with(propagation.extract(context.active(), ctx), fn)
  }

  async wrapToolHandler<
    F extends latitude.ToolHandler<latitude.ToolSpec, keyof latitude.ToolSpec>,
  >(fn: F, ...args: Parameters<F>): Promise<Awaited<ReturnType<F>>> {
    const toolArguments = args[0]
    const { toolId, toolName } = args[1]

    const [ctx, ok, err] = this.telemetry.tool(context.active(), {
      name: toolName,
      call: {
        id: toolId,
        arguments: toolArguments,
      },
    })

    let result
    try {
      result = await context.with(
        ctx,
        async () => await ((fn as any)(...args) as ReturnType<F>),
      )
    } catch (error) {
      if ((error as Error).name === 'ToolExecutionPausedError') {
        err(error as Error)
        throw error
      }

      ok({
        result: {
          value: (error as Error).message,
          isError: true,
        },
      })
      throw error
    }

    ok({
      result: {
        value: result,
        isError: false,
      },
    })

    return result
  }

  async wrapRenderChain<F extends latitude.Latitude['renderChain']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { prompt } = args[0]

    return await this.telemetry.conversation(
      {
        versionUuid: prompt.versionUuid,
        documentUuid: prompt.uuid,
      },
      async () =>
        // Note: we cannot know the follow up interactions
        this.telemetry.interaction({}, async () => {
          return (fn as any)(...args) as ReturnType<F>
        }),
    )
  }

  async wrapRenderAgent<F extends latitude.Latitude['renderAgent']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { prompt } = args[0]

    return await this.telemetry.conversation(
      {
        versionUuid: prompt.versionUuid,
        documentUuid: prompt.uuid,
      },
      async () =>
        // Note: we cannot know the follow up interactions
        this.telemetry.interaction({}, async () => {
          return (fn as any)(...args) as ReturnType<F>
        }),
    )
  }

  async wrapRenderStep<F extends latitude.Latitude['renderStep']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { prompt, parameters } = args[0]

    let jsonParameters = ''
    try {
      jsonParameters = JSON.stringify(parameters)
    } catch (error) {
      jsonParameters = '{}'
    }

    return await this.telemetry.step(
      {
        // Note: cascading down some attributes in case the
        // provider instrumentations don't set them
        attributes: {
          [ATTR_GEN_AI_REQUEST_TEMPLATE]: prompt,
          [ATTR_GEN_AI_REQUEST_PARAMETERS]: jsonParameters,
        },
      },
      async () => {
        return (fn as any)(...args) as ReturnType<F>
      },
    )
  }

  async wrapRenderCompletion<F extends latitude.Latitude['renderCompletion']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    if (!this.options.completions) {
      return await ((fn as any)(...args) as ReturnType<F>)
    }

    const { provider, config, prompt, parameters, messages } = args[0]
    const model = (config.model as string) || 'unknown'

    const [ctx, ok, err] = this.telemetry.completion(context.active(), {
      name: `${provider} / ${model}`,
      provider: provider,
      model: model,
      configuration: config,
      template: prompt,
      parameters: parameters,
      input: messages as Record<string, unknown>[],
    })

    let result
    try {
      result = await context.with(
        ctx,
        async () => await ((fn as any)(...args) as ReturnType<F>),
      )
    } catch (error) {
      err(error as Error)
      throw error
    }

    // Note: enhance, this is just an estimation
    const promptTokens = this.countTokens(messages)
    const completionTokens = this.countTokens(result.messages)

    ok({
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

    const [ctx, ok, err] = this.telemetry.tool(context.active(), {
      name: toolRequest.toolName,
      call: {
        id: toolRequest.toolCallId,
        arguments: toolRequest.toolArguments,
      },
    })

    let result
    try {
      result = await context.with(
        ctx,
        async () => await ((fn as any)(...args) as ReturnType<F>),
      )
    } catch (error) {
      err(error as Error)
      throw error
    }

    ok({
      result: {
        value: result,
        isError: false, // Note: currently unknown
      },
    })

    return result
  }
}
