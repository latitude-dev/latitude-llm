import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_RESPONSE_ID,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_CREATE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
  GEN_AI_OUTPUT_TYPE_VALUE_IMAGE,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_OUTPUT_TYPE_VALUE_SPEECH,
  GEN_AI_OUTPUT_TYPE_VALUE_TEXT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
} from '@opentelemetry/semantic-conventions/incubating'

import {
  ATTR_SERVICE_NAME,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_ERROR_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_TYPE,
  ATTR_OTEL_SCOPE_NAME,
  ATTR_OTEL_SCOPE_VERSION,
  ATTR_OTEL_STATUS_CODE,
  ATTR_OTEL_STATUS_DESCRIPTION,
} from '@opentelemetry/semantic-conventions'

import { SpanAttribute } from './span'

export const ATTRIBUTES = {
  // Custom attributes added and used by Latitude spans (Prompt / External / Chat)
  LATITUDE: {
    name: 'latitude.name',
    type: 'latitude.type',
    documentUuid: 'latitude.document_uuid',
    promptPath: 'latitude.prompt_path',
    commitUuid: 'latitude.commit_uuid',
    documentLogUuid: 'latitude.document_log_uuid',
    projectId: 'latitude.project_id',
    experimentUuid: 'latitude.experiment_uuid',
    source: 'latitude.source',
    externalId: 'latitude.external_id',
    testDeploymentId: 'latitude.test_deployment_id',
    previousTraceId: 'latitude.previous_trace_id',

    internal: 'latitude.internal',

    // Custom additions to the GenAI semantic conventions (deprecated)
    request: {
      _root: 'gen_ai.request',
      model: 'gen_ai.request.model',
      configuration: 'gen_ai.request.configuration',
      template: 'gen_ai.request.template',
      parameters: 'gen_ai.request.parameters',
      messages: 'gen_ai.request.messages',
      systemPrompt: 'gen_ai.request.system',
    },
    response: {
      _root: 'gen_ai.response',
      messages: 'gen_ai.response.messages',
    },
    usage: {
      promptTokens: 'gen_ai.usage.prompt_tokens',
      cachedTokens: 'gen_ai.usage.cached_tokens',
      reasoningTokens: 'gen_ai.usage.reasoning_tokens',
      completionTokens: 'gen_ai.usage.completion_tokens',
    },
  },

  // Official OpenTelemetry semantic conventions
  OPENTELEMETRY: {
    SERVICE: {
      name: ATTR_SERVICE_NAME,
    },
    OTEL: {
      scope: {
        name: ATTR_OTEL_SCOPE_NAME,
        version: ATTR_OTEL_SCOPE_VERSION,
      },
      status: {
        code: ATTR_OTEL_STATUS_CODE,
        description: ATTR_OTEL_STATUS_DESCRIPTION,
      },
    },
    ERROR: {
      type: ATTR_ERROR_TYPE,
    },
    EXCEPTION: {
      message: ATTR_EXCEPTION_MESSAGE,
      type: ATTR_EXCEPTION_TYPE,
    },
    HTTP: {
      request: {
        url: 'http.request.url',
        body: 'http.request.body',
        header: 'http.request.header',
        headers: 'http.request.headers',
        method: ATTR_HTTP_REQUEST_METHOD,
      },
      response: {
        body: 'http.response.body',
        header: 'http.response.header',
        headers: 'http.response.headers',
        statusCode: ATTR_HTTP_RESPONSE_STATUS_CODE,
      },
    },

    // GenAI semantic conventions
    // https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
    GEN_AI: {
      conversationId: 'gen_ai.conversation.id',
      operation: ATTR_GEN_AI_OPERATION_NAME,
      provider: 'gen_ai.provider.name', // openai; gcp.gen_ai; gcp.vertex_ai
      request: {
        _root: 'gen_ai.request', // Contains prompt configuration settings (temperature, model, max_tokens, etc.)
      },
      response: {
        id: ATTR_GEN_AI_RESPONSE_ID,
        model: ATTR_GEN_AI_RESPONSE_MODEL,
        finishReasons: ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
      },
      usage: {
        inputTokens: ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        outputTokens: ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
      },
      systemInstructions: 'gen_ai.system.instructions', // Contains the PARTS of the "system message"
      tool: {
        definitions: 'gen_ai.tool.definitions',
        call: {
          id: ATTR_GEN_AI_TOOL_CALL_ID,
          arguments: 'gen_ai.tool.call.arguments',
          result: 'gen_ai.tool.call.result',
        },
        name: ATTR_GEN_AI_TOOL_NAME,
        description: ATTR_GEN_AI_TOOL_DESCRIPTION,
        type: ATTR_GEN_AI_TOOL_TYPE,
      },
      input: {
        messages: 'gen_ai.input.messages',
      },
      output: {
        messages: 'gen_ai.output.messages',
      },
      _deprecated: {
        system: ATTR_GEN_AI_SYSTEM,
        tool: {
          name: ATTR_GEN_AI_TOOL_NAME,
          type: ATTR_GEN_AI_TOOL_TYPE,
          call: {
            name: 'gen_ai.tool.call.name',
            description: 'gen_ai.tool.call.description',
            type: 'gen_ai.tool.call.type',
          },
          result: {
            value: 'gen_ai.tool.result.value',
            isError: 'gen_ai.tool.result.is_error',
          },
        },
        prompt: {
          _root: 'gen_ai.prompt',
          index: (promptIndex: number) => ({
            role: `gen_ai.prompt.${promptIndex}.role`,
            content: `gen_ai.prompt.${promptIndex}.content`, // string or object
            toolCalls: (toolCallIndex: number) => ({
              id: `gen_ai.prompt.${promptIndex}.tool_calls.${toolCallIndex}.id`,
              name: `gen_ai.prompt.${promptIndex}.tool_calls.${toolCallIndex}.name`,
              arguments: `gen_ai.prompt.${promptIndex}.tool_calls.${toolCallIndex}.arguments`,
            }),
            tool: {
              callId: `gen_ai.prompt.${promptIndex}.tool_call_id`,
              toolName: `gen_ai.prompt.${promptIndex}.tool_name`,
              isError: `gen_ai.prompt.${promptIndex}.is_error`,
            },
          }),
        },
        completion: {
          _root: 'gen_ai.completion',
          index: (completionIndex: number) => ({
            role: `gen_ai.completion.${completionIndex}.role`,
            content: `gen_ai.completion.${completionIndex}.content`, // string or object
            toolCalls: (toolCallIndex: number) => ({
              id: `gen_ai.completion.${completionIndex}.tool_calls.${toolCallIndex}.id`,
              name: `gen_ai.completion.${completionIndex}.tool_calls.${toolCallIndex}.name`,
              arguments: `gen_ai.completion.${completionIndex}.tool_calls.${toolCallIndex}.arguments`,
            }),
            tool: {
              callId: `gen_ai.prompt.${completionIndex}.tool_call_id`,
              toolName: `gen_ai.prompt.${completionIndex}.tool_name`,
              isError: `gen_ai.prompt.${completionIndex}.is_error`,
            },
          }),
        },
        usage: {
          promptTokens: 'gen_ai.usage.prompt_tokens',
          completionTokens: 'gen_ai.usage.completion_tokens',
        },
      },
    },
  },

  // OpenInference (Arize/Phoenix)
  // https://arize-ai.github.io/openinference/spec/semantic_conventions.html
  OPENINFERENCE: {
    span: {
      kind: 'openinference.span.kind',
    },
    tool: {
      name: 'tool.name',
    },
    toolCall: {
      id: 'tool_call.id',
      function: {
        arguments: 'tool_call.function.arguments',
        result: 'tool_call.function.result',
      },
    },
    llm: {
      provider: 'llm.provider',
      system: 'llm.system', // Represents the provider!
      model: 'llm.model_name',
      inputMessages: 'llm.input_messages',
      outputMessages: 'llm.output_messages',
      invocationParameters: 'llm.invocation_parameters',
      prompts: 'llm.prompts', // llm.prompts.{index}.{role/content/...},
      completions: 'llm.completions', // llm.completions.{index}.{role/content/...},
      tools: 'llm.tools', // llm.tools.{index}.{name/arguments/result/...},
      tokenCount: {
        prompt: 'llm.token_count.prompt',
        promptDetails: {
          cacheInput: 'llm.token_count.prompt_details.cache_input',
          cacheRead: 'llm.token_count.prompt_details.cache_read',
          cacheWrite: 'llm.token_count.prompt_details.cache_write',
        },
        completionDetails: {
          reasoning: 'llm.token_count.completion_details.reasoning',
        },
        completion: 'llm.token_count.completion',
      },
      cost: {
        prompt: 'llm.cost.prompt',
        completion: 'llm.cost.completion',
        total: 'llm.cost.total',
      },
    },
  },

  // OpenLLMetry (Traceloop)
  // https://github.com/traceloop/openllmetry
  // https://github.com/traceloop/openllmetry/blob/main/packages/opentelemetry-semantic-conventions-ai/opentelemetry/semconv_ai/__init__.py
  OPENLLMETRY: {
    llm: {
      request: {
        type: 'llm.request.type',
      },
      response: {
        finishReason: 'llm.response.finish_reason',
        stopReason: 'llm.response.stop_reason',
      },
    },
    usage: {
      cacheCreationInputTokens: 'gen_ai.usage.cache_creation_input_tokens',
      cacheReadInputTokens: 'gen_ai.usage.cache_read_input_tokens',
    },
  },

  // Vercel AI SDK
  // https://ai-sdk.dev/docs/ai-sdk-core/telemetry#span-details
  AI_SDK: {
    operationId: 'ai.operationId',
    model: {
      id: 'ai.model.id',
      provider: 'ai.model.provider',
    },
    request: {
      headers: {
        _root: 'ai.request.headers',
      },
    },
    response: {
      id: 'ai.response.id',
      model: 'ai.response.model',
      finishReason: 'ai.response.finishReason',
      text: 'ai.response.text',
      object: 'ai.response.object',
      toolCalls: 'ai.response.toolCalls',
    },
    toolCall: {
      name: 'ai.toolCall.name',
      id: 'ai.toolCall.id',
      args: 'ai.toolCall.args',
      result: 'ai.toolCall.result',
    },
    usage: {
      completionTokens: 'ai.usage.completionTokens',
      promptTokens: 'ai.usage.promptTokens',
    },
    settings: 'ai.settings',
    prompt: {
      messages: 'ai.prompt.messages',
    },
  },

  // OpenAI Agents
  // https://openai.github.io/openai-agents-js/guides/tracing/
  OPENAI_AGENTS: {
    type: 'openai.agents.type',
    response: {
      input: 'openai.agents._input',
      output: 'openai.agents._response',
    },
    toolCall: {
      name: 'openai.agents.name',
      input: 'openai.agents.input',
      output: 'openai.agents.output',
    },
    traceId: 'openai.agents.trace_id',
    spanId: 'openai.agents.span_id',
  }
} as const

export const VALUES = {
  LATITUDE: {},
  OPENTELEMETRY: {
    GEN_AI: {
      operation: {
        chat: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        createAgent: GEN_AI_OPERATION_NAME_VALUE_CREATE_AGENT,
        embeddings: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
        executeTool: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
        generateContent: GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
        invokeAgent: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
        textCompletion: GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
      },
      response: {
        finishReasons: {
          stop: 'stop',
          length: 'length',
          contentFilter: 'content_filter',
          toolCalls: 'tool_calls',
          error: 'error',
          other: 'other',
          unknown: 'unknown',
        },
      },
      output: {
        type: {
          image: GEN_AI_OUTPUT_TYPE_VALUE_IMAGE,
          json: GEN_AI_OUTPUT_TYPE_VALUE_JSON,
          speech: GEN_AI_OUTPUT_TYPE_VALUE_SPEECH,
          text: GEN_AI_OUTPUT_TYPE_VALUE_TEXT,
        },
      },
      tool: {
        type: {
          function: 'function',
        },
      },
      _deprecated: {
        operation: {
          tool: 'tool',
          completion: 'completion',
          embedding: 'embedding',
          retrieval: 'retrieval',
          reranking: 'reranking',
        },
      },
    },
  },
  OPENLLMETRY: {
    llm: {
      request: {
        // https://github.com/traceloop/openllmetry/blob/0fc734017197e48e988eaf54e20feaab8761f757/packages/opentelemetry-semantic-conventions-ai/opentelemetry/semconv_ai/__init__.py#L277
        type: {
          completion: 'completion',
          chat: 'chat',
          rerank: 'rerank',
          embedding: 'embedding',
          unknown: 'unknown',
        },
      },
    },
  },
  OPENINFERENCE: {
    span: {
      kind: {
        llm: 'LLM',
        chain: 'CHAIN',
        embedding: 'EMBEDDING',
        tool: 'TOOL',
        agent: 'AGENT',
        retriever: 'RETRIEVER',
        reranker: 'RERANKER',
      },
    },
  },
  AI_SDK: {
    // https://ai-sdk.dev/docs/ai-sdk-core/telemetry#span-details
    operationId: {
      // Vercel Wrappers (all contain at least one of the "Completion" operations)
      generateText: 'ai.generateText',
      streamText: 'ai.streamText',
      generateObject: 'ai.generateObject',
      streamObject: 'ai.streamObject',

      // Completions
      generateTextDoGenerate: 'ai.generateText.doGenerate',
      streamTextDoStream: 'ai.streamText.doStream',
      generateObjectDoGenerate: 'ai.generateObject.doGenerate',
      streamObjectDoStream: 'ai.streamObject.doStream',

      // Embeddings
      embed: 'ai.embed',
      embedDoEmbed: 'ai.embed.doEmbed',
      embedMany: 'ai.embed.embedMany',
      embedManyDoEmbed: 'ai.embed.embedMany.doEmbed',

      // Tool calling
      toolCall: 'ai.toolCall',
    },
  },

  OPENAI_AGENTS: {
    type: {
      response: 'response',
      function: 'function',
    },
  },
}

/**
 * Returns the first value found in the attributes object with one of the given keys.
 * If an attribute callback is provided,
 */
export function extractAttribute<T = string>({
  attributes,
  keys,
  serializer = (value) => String(value) as T,
  validation,
}: {
  attributes: Record<string, SpanAttribute>
  keys: string[]
  serializer?: (value: unknown) => T
  validation?: (value: T) => boolean
}): T | undefined {
  for (const key of keys) {
    if (key in attributes) {
      const value = serializer(attributes[key])
      if (!validation) return value
      if (validation(value)) return value
    }
  }
  return undefined
}

export function extractAllAttributes<T = string>({
  attributes,
  keys,
  serializer = (value) => String(value) as T,
  validation,
}: {
  attributes: Record<string, SpanAttribute>
  keys: string[]
  serializer?: (value: unknown) => T
  validation?: (value: T) => boolean
}): T[] {
  const results: T[] = []
  for (const key of keys) {
    if (key in attributes) {
      const value = serializer(attributes[key])
      if (validation && !validation(value)) continue
      results.push(value)
    }
  }

  return results
}
