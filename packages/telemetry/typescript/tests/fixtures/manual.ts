export const MANUAL_PROMPT_WITH_TOOLS_SPANS = {
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": {
              "stringValue": "fake-service-name"
            }
          },
          {
            "key": "telemetry.sdk.language",
            "value": {
              "stringValue": "nodejs"
            }
          },
          {
            "key": "telemetry.sdk.name",
            "value": {
              "stringValue": "opentelemetry"
            }
          },
          {
            "key": "telemetry.sdk.version",
            "value": {
              "stringValue": "SDK_VERSION"
            }
          }
        ],
        "droppedAttributesCount": 0
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "so.latitude.instrumentation.manual",
            "version": "fake-scope-version"
          },
          "spans": [
            {
              "traceId": "ID_0",
              "spanId": "ID_1",
              "parentSpanId": "ID_2",
              "name": "POST https://api.openai.com/v1/chat/completions",
              "kind": 3,
              "startTimeUnixNano": "TIME",
              "endTimeUnixNano": "TIME",
              "attributes": [
                {
                  "key": "latitude.type",
                  "value": {
                    "stringValue": "http"
                  }
                },
                {
                  "key": "http.request.method",
                  "value": {
                    "stringValue": "POST"
                  }
                },
                {
                  "key": "http.request.url",
                  "value": {
                    "stringValue": "https://api.openai.com/v1/chat/completions"
                  }
                },
                {
                  "key": "http.request.header.content-type",
                  "value": {
                    "stringValue": "application/json"
                  }
                },
                {
                  "key": "http.request.body",
                  "value": {
                    "stringValue": "{\"model\":\"gpt-4o\",\"messages\":[{\"role\":\"system\",\"content\":\"You are helpful.\"},{\"role\":\"user\",\"content\":\"What is the weather?\"}]}"
                  }
                },
                {
                  "key": "http.response.status_code",
                  "value": {
                    "intValue": 200
                  }
                },
                {
                  "key": "http.response.header.content-type",
                  "value": {
                    "stringValue": "application/json"
                  }
                },
                {
                  "key": "http.response.body",
                  "value": {
                    "stringValue": "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"Let me check the weather for you.\",\"tool_calls\":[{\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"arguments\":\"{\\\"city\\\":\\\"NYC\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":20,\"completion_tokens\":15}}"
                  }
                }
              ],
              "droppedAttributesCount": 0,
              "events": [],
              "droppedEventsCount": 0,
              "status": {
                "code": 1
              },
              "links": [],
              "droppedLinksCount": 0
            },
            {
              "traceId": "ID_0",
              "spanId": "ID_2",
              "parentSpanId": "ID_3",
              "name": "openai / gpt-4o",
              "kind": 3,
              "startTimeUnixNano": "TIME",
              "endTimeUnixNano": "TIME",
              "attributes": [
                {
                  "key": "latitude.type",
                  "value": {
                    "stringValue": "completion"
                  }
                },
                {
                  "key": "gen_ai.operation.name",
                  "value": {
                    "stringValue": "completion"
                  }
                },
                {
                  "key": "gen_ai.system",
                  "value": {
                    "stringValue": "openai"
                  }
                },
                {
                  "key": "gen_ai.request.configuration",
                  "value": {
                    "stringValue": "{\"temperature\":0.5,\"model\":\"gpt-4o\"}"
                  }
                },
                {
                  "key": "gen_ai.request.temperature",
                  "value": {
                    "doubleValue": 0.5
                  }
                },
                {
                  "key": "gen_ai.request.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.system.instructions",
                  "value": {
                    "stringValue": "[{\"type\":\"text\",\"content\":\"You are helpful.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":0}}}]"
                  }
                },
                {
                  "key": "gen_ai.input.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"content\":\"What is the weather?\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.output.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"Let me check the weather for you.\"},{\"type\":\"tool_call\",\"id\":\"call_1\",\"name\":\"get_weather\",\"arguments\":{\"city\":\"NYC\"}}]}]"
                  }
                },
                {
                  "key": "gen_ai.usage.input_tokens",
                  "value": {
                    "intValue": 20
                  }
                },
                {
                  "key": "gen_ai.usage.output_tokens",
                  "value": {
                    "intValue": 15
                  }
                },
                {
                  "key": "gen_ai.usage.prompt_tokens",
                  "value": {
                    "intValue": 20
                  }
                },
                {
                  "key": "gen_ai.usage.cached_tokens",
                  "value": {
                    "intValue": 0
                  }
                },
                {
                  "key": "gen_ai.usage.reasoning_tokens",
                  "value": {
                    "intValue": 0
                  }
                },
                {
                  "key": "gen_ai.usage.completion_tokens",
                  "value": {
                    "intValue": 15
                  }
                },
                {
                  "key": "gen_ai.response.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.response.finish_reasons",
                  "value": {
                    "arrayValue": {
                      "values": [
                        {
                          "stringValue": "tool_calls"
                        }
                      ]
                    }
                  }
                }
              ],
              "droppedAttributesCount": 0,
              "events": [],
              "droppedEventsCount": 0,
              "status": {
                "code": 1
              },
              "links": [],
              "droppedLinksCount": 0
            },
            {
              "traceId": "ID_0",
              "spanId": "ID_4",
              "parentSpanId": "ID_3",
              "name": "get_weather",
              "kind": 3,
              "startTimeUnixNano": "TIME",
              "endTimeUnixNano": "TIME",
              "attributes": [
                {
                  "key": "latitude.type",
                  "value": {
                    "stringValue": "tool"
                  }
                },
                {
                  "key": "gen_ai.operation.name",
                  "value": {
                    "stringValue": "tool"
                  }
                },
                {
                  "key": "gen_ai.tool.name",
                  "value": {
                    "stringValue": "get_weather"
                  }
                },
                {
                  "key": "gen_ai.tool.type",
                  "value": {
                    "stringValue": "function"
                  }
                },
                {
                  "key": "gen_ai.tool.call.id",
                  "value": {
                    "stringValue": "call_1"
                  }
                },
                {
                  "key": "gen_ai.tool.call.arguments",
                  "value": {
                    "stringValue": "{\"city\":\"NYC\"}"
                  }
                },
                {
                  "key": "gen_ai.tool.result.value",
                  "value": {
                    "stringValue": "{\"weather\":\"sunny\",\"temp\":72}"
                  }
                },
                {
                  "key": "gen_ai.tool.result.is_error",
                  "value": {
                    "boolValue": false
                  }
                }
              ],
              "droppedAttributesCount": 0,
              "events": [],
              "droppedEventsCount": 0,
              "status": {
                "code": 1
              },
              "links": [],
              "droppedLinksCount": 0
            },
            {
              "traceId": "ID_0",
              "spanId": "ID_5",
              "parentSpanId": "ID_6",
              "name": "POST https://api.openai.com/v1/chat/completions",
              "kind": 3,
              "startTimeUnixNano": "TIME",
              "endTimeUnixNano": "TIME",
              "attributes": [
                {
                  "key": "latitude.type",
                  "value": {
                    "stringValue": "http"
                  }
                },
                {
                  "key": "http.request.method",
                  "value": {
                    "stringValue": "POST"
                  }
                },
                {
                  "key": "http.request.url",
                  "value": {
                    "stringValue": "https://api.openai.com/v1/chat/completions"
                  }
                },
                {
                  "key": "http.request.header.content-type",
                  "value": {
                    "stringValue": "application/json"
                  }
                },
                {
                  "key": "http.request.body",
                  "value": {
                    "stringValue": "{\"model\":\"gpt-4o\"}"
                  }
                },
                {
                  "key": "http.response.status_code",
                  "value": {
                    "intValue": 200
                  }
                },
                {
                  "key": "http.response.header.content-type",
                  "value": {
                    "stringValue": "application/json"
                  }
                },
                {
                  "key": "http.response.body",
                  "value": {
                    "stringValue": "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"The weather in NYC is sunny, 72F!\"},\"finish_reason\":\"stop\"}]}"
                  }
                }
              ],
              "droppedAttributesCount": 0,
              "events": [],
              "droppedEventsCount": 0,
              "status": {
                "code": 1
              },
              "links": [],
              "droppedLinksCount": 0
            },
            {
              "traceId": "ID_0",
              "spanId": "ID_6",
              "parentSpanId": "ID_3",
              "name": "openai / gpt-4o",
              "kind": 3,
              "startTimeUnixNano": "TIME",
              "endTimeUnixNano": "TIME",
              "attributes": [
                {
                  "key": "latitude.type",
                  "value": {
                    "stringValue": "completion"
                  }
                },
                {
                  "key": "gen_ai.operation.name",
                  "value": {
                    "stringValue": "completion"
                  }
                },
                {
                  "key": "gen_ai.system",
                  "value": {
                    "stringValue": "openai"
                  }
                },
                {
                  "key": "gen_ai.request.configuration",
                  "value": {
                    "stringValue": "{\"temperature\":0.5,\"model\":\"gpt-4o\"}"
                  }
                },
                {
                  "key": "gen_ai.request.temperature",
                  "value": {
                    "doubleValue": 0.5
                  }
                },
                {
                  "key": "gen_ai.request.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.system.instructions",
                  "value": {
                    "stringValue": "[{\"type\":\"text\",\"content\":\"You are helpful.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":0}}}]"
                  }
                },
                {
                  "key": "gen_ai.input.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"content\":\"What is the weather?\"}]},{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"Let me check the weather for you.\"},{\"type\":\"tool_call\",\"id\":\"call_1\",\"name\":\"get_weather\",\"arguments\":{\"city\":\"NYC\"}}]},{\"role\":\"tool\",\"parts\":[{\"type\":\"tool_call_response\",\"id\":\"call_1\",\"response\":\"{\\\"weather\\\":\\\"sunny\\\",\\\"temp\\\":72}\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.output.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The weather in NYC is sunny, 72F!\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.usage.input_tokens",
                  "value": {
                    "intValue": 45
                  }
                },
                {
                  "key": "gen_ai.usage.output_tokens",
                  "value": {
                    "intValue": 10
                  }
                },
                {
                  "key": "gen_ai.usage.prompt_tokens",
                  "value": {
                    "intValue": 40
                  }
                },
                {
                  "key": "gen_ai.usage.cached_tokens",
                  "value": {
                    "intValue": 5
                  }
                },
                {
                  "key": "gen_ai.usage.reasoning_tokens",
                  "value": {
                    "intValue": 0
                  }
                },
                {
                  "key": "gen_ai.usage.completion_tokens",
                  "value": {
                    "intValue": 10
                  }
                },
                {
                  "key": "gen_ai.response.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.response.finish_reasons",
                  "value": {
                    "arrayValue": {
                      "values": [
                        {
                          "stringValue": "stop"
                        }
                      ]
                    }
                  }
                }
              ],
              "droppedAttributesCount": 0,
              "events": [],
              "droppedEventsCount": 0,
              "status": {
                "code": 1
              },
              "links": [],
              "droppedLinksCount": 0
            },
            {
              "traceId": "ID_0",
              "spanId": "ID_3",
              "name": "prompt",
              "kind": 3,
              "startTimeUnixNano": "TIME",
              "endTimeUnixNano": "TIME",
              "attributes": [
                {
                  "key": "latitude.type",
                  "value": {
                    "stringValue": "prompt"
                  }
                },
                {
                  "key": "gen_ai.request.template",
                  "value": {
                    "stringValue": "---\nprovider: openai\nmodel: gpt-4o\ntemperature: 0.5\n---\nYou are helpful.\n<user>{{question}}</user>"
                  }
                },
                {
                  "key": "gen_ai.request.parameters",
                  "value": {
                    "stringValue": "{\"question\":\"What is the weather?\"}"
                  }
                },
                {
                  "key": "latitude.documentLogUuid",
                  "value": {
                    "stringValue": "fake-doc-log-uuid"
                  }
                },
                {
                  "key": "latitude.documentUuid",
                  "value": {
                    "stringValue": "fake-prompt-uuid"
                  }
                }
              ],
              "droppedAttributesCount": 0,
              "events": [],
              "droppedEventsCount": 0,
              "status": {
                "code": 1
              },
              "links": [],
              "droppedLinksCount": 0
            }
          ]
        }
      ]
    }
  ]
}

export const MANUAL_COMPLETION_ERROR_SPANS = {
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": {
              "stringValue": "fake-service-name"
            }
          },
          {
            "key": "telemetry.sdk.language",
            "value": {
              "stringValue": "nodejs"
            }
          },
          {
            "key": "telemetry.sdk.name",
            "value": {
              "stringValue": "opentelemetry"
            }
          },
          {
            "key": "telemetry.sdk.version",
            "value": {
              "stringValue": "SDK_VERSION"
            }
          }
        ],
        "droppedAttributesCount": 0
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "so.latitude.instrumentation.manual",
            "version": "fake-scope-version"
          },
          "spans": [
            {
              "traceId": "ID_0",
              "spanId": "ID_1",
              "name": "openai / gpt-4o",
              "kind": 3,
              "startTimeUnixNano": "TIME",
              "endTimeUnixNano": "TIME",
              "attributes": [
                {
                  "key": "latitude.type",
                  "value": {
                    "stringValue": "completion"
                  }
                },
                {
                  "key": "gen_ai.operation.name",
                  "value": {
                    "stringValue": "completion"
                  }
                },
                {
                  "key": "gen_ai.system",
                  "value": {
                    "stringValue": "openai"
                  }
                },
                {
                  "key": "gen_ai.request.configuration",
                  "value": {
                    "stringValue": "{\"model\":\"gpt-4o\"}"
                  }
                },
                {
                  "key": "gen_ai.request.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.system.instructions",
                  "value": {
                    "stringValue": "[{\"type\":\"text\",\"content\":\"You are helpful.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":0}}}]"
                  }
                },
                {
                  "key": "gen_ai.input.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"content\":\"Hello\"}]}]"
                  }
                }
              ],
              "droppedAttributesCount": 0,
              "events": [
                {
                  "attributes": [
                    {
                      "key": "exception.type",
                      "value": {
                        "stringValue": "Error"
                      }
                    },
                    {
                      "key": "exception.message",
                      "value": {
                        "stringValue": "LLM provider error"
                      }
                    },
                    {
                      "key": "exception.stacktrace",
                      "value": {
                        "stringValue": "STACKTRACE"
                      }
                    }
                  ],
                  "name": "exception",
                  "timeUnixNano": "TIME",
                  "droppedAttributesCount": 0
                }
              ],
              "droppedEventsCount": 0,
              "status": {
                "code": 2,
                "message": "LLM provider error"
              },
              "links": [],
              "droppedLinksCount": 0
            }
          ]
        }
      ]
    }
  ]
}
