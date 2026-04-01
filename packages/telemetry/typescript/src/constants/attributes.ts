/**
 * Attribute key constants for telemetry spans.
 * Inlined from @latitude-data/constants to keep the SDK self-contained.
 * Uses raw string values instead of @opentelemetry/semantic-conventions/incubating
 * to minimize the dependency surface.
 */
export const ATTRIBUTES = {
  LATITUDE: {
    name: "latitude.name",
    type: "latitude.type",
    documentUuid: "latitude.document_uuid",
    promptPath: "latitude.prompt_path",
    commitUuid: "latitude.commit_uuid",
    documentLogUuid: "latitude.document_log_uuid",
    projectId: "latitude.project_id",
    experimentUuid: "latitude.experiment_uuid",
    source: "latitude.source",
    externalId: "latitude.external_id",
    testDeploymentId: "latitude.test_deployment_id",
    previousTraceId: "latitude.previous_trace_id",
    internal: "latitude.internal",

    request: {
      _root: "gen_ai.request",
      model: "gen_ai.request.model",
      configuration: "gen_ai.request.configuration",
      template: "gen_ai.request.template",
      parameters: "gen_ai.request.parameters",
      messages: "gen_ai.request.messages",
      systemPrompt: "gen_ai.request.system",
    },
    response: {
      _root: "gen_ai.response",
      messages: "gen_ai.response.messages",
    },
    usage: {
      promptTokens: "gen_ai.usage.prompt_tokens",
      cachedTokens: "gen_ai.usage.cached_tokens",
      reasoningTokens: "gen_ai.usage.reasoning_tokens",
      completionTokens: "gen_ai.usage.completion_tokens",
    },
  },

  OPENTELEMETRY: {
    SERVICE: {
      name: "service.name",
    },
    OTEL: {
      scope: {
        name: "otel.scope.name",
        version: "otel.scope.version",
      },
      status: {
        code: "otel.status_code",
        description: "otel.status_description",
      },
    },
    ERROR: {
      type: "error.type",
    },
    EXCEPTION: {
      message: "exception.message",
      type: "exception.type",
    },
    HTTP: {
      request: {
        url: "http.request.url",
        body: "http.request.body",
        header: "http.request.header",
        headers: "http.request.headers",
        method: "http.request.method",
      },
      response: {
        body: "http.response.body",
        header: "http.response.header",
        headers: "http.response.headers",
        statusCode: "http.response.status_code",
      },
    },

    GEN_AI: {
      conversationId: "gen_ai.conversation.id",
      operation: "gen_ai.operation.name",
      provider: "gen_ai.provider.name",
      request: {
        _root: "gen_ai.request",
      },
      response: {
        id: "gen_ai.response.id",
        model: "gen_ai.response.model",
        finishReasons: "gen_ai.response.finish_reasons",
      },
      usage: {
        inputTokens: "gen_ai.usage.input_tokens",
        outputTokens: "gen_ai.usage.output_tokens",
      },
      systemInstructions: "gen_ai.system.instructions",
      tool: {
        definitions: "gen_ai.tool.definitions",
        call: {
          id: "gen_ai.tool.call.id",
          arguments: "gen_ai.tool.call.arguments",
          result: "gen_ai.tool.call.result",
        },
        name: "gen_ai.tool.name",
        description: "gen_ai.tool.description",
        type: "gen_ai.tool.type",
      },
      input: {
        messages: "gen_ai.input.messages",
      },
      output: {
        messages: "gen_ai.output.messages",
      },
      _deprecated: {
        system: "gen_ai.system",
        tool: {
          name: "gen_ai.tool.name",
          type: "gen_ai.tool.type",
          call: {
            name: "gen_ai.tool.call.name",
            description: "gen_ai.tool.call.description",
            type: "gen_ai.tool.call.type",
          },
          result: {
            value: "gen_ai.tool.result.value",
            isError: "gen_ai.tool.result.is_error",
          },
        },
      },
    },
  },
} as const

export const VALUES = {
  OPENTELEMETRY: {
    GEN_AI: {
      response: {
        finishReasons: {
          stop: "stop",
          length: "length",
          contentFilter: "content_filter",
          toolCalls: "tool_calls",
          error: "error",
          other: "other",
          unknown: "unknown",
        },
      },
      tool: {
        type: {
          function: "function",
        },
      },
    },
  },
} as const
