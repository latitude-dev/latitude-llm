import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { ManualInstrumentation } from '$telemetry/instrumentations/manual'
import {
  DocumentType,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_STOP,
  GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS,
  SpanSource,
} from '@latitude-data/constants'
import type * as latitude from '@latitude-data/sdk'
import * as otel from '@opentelemetry/api'
import { context } from '@opentelemetry/api'

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

  // TODO(tracing): instrument wrapToolCall

  async wrapRenderChain<F extends latitude.Latitude['renderChain']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { prompt } = args[0]

    return await this.telemetry.document(
      {
        name: prompt.path.split('/').at(-1),
        versionUuid: prompt.versionUuid,
        documentUuid: prompt.uuid,
        documentType: DocumentType.Prompt,
        promptHash: prompt.contentHash,
      },
      async () => {
        return (fn as any)(...args) as ReturnType<F>
      },
    )
  }

  async wrapRenderAgent<F extends latitude.Latitude['renderAgent']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { prompt } = args[0]

    return await this.telemetry.document(
      {
        name: prompt.path.split('/').at(-1),
        versionUuid: prompt.versionUuid,
        documentUuid: prompt.uuid,
        documentType: DocumentType.Agent,
        promptHash: prompt.contentHash,
      },
      async () => {
        return (fn as any)(...args) as ReturnType<F>
      },
    )
  }

  async wrapRenderStep<F extends latitude.Latitude['renderStep']>(
    fn: F,
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    const { step } = args[0]

    return await this.telemetry.step(
      {
        name: `Step ${step}`,
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

    const { provider, config, messages } = args[0]
    const model = (config.model as string) || 'unknown'

    const [ctx, ok, err] = this.telemetry.completion(context.active(), {
      name: `${provider} / ${model}`,
      provider: provider,
      model: model,
      configuration: config,
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

    ok({
      output: result.messages as Record<string, unknown>[],
      tokens: { input: 0, output: 0 }, // Note: currently unknown
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
      call: {
        result: result,
        isError: false, // Note: currently unknown
      },
    })

    return result
  }
}
