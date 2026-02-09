export const LATITUDE_RENDERING_SPANS = {
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
            "name": "so.latitude.instrumentation.latitude",
            "version": "fake-scope-version"
          },
          "spans": [
            {
              "traceId": "ID_0",
              "spanId": "ID_1",
              "parentSpanId": "ID_2",
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
                    "stringValue": "{\"provider\":\"openai\",\"model\":\"gpt-4o\",\"type\":\"agent\",\"temperature\":0.5,\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"description\":\"Get the weather for a given location\",\"parameters\":{\"location\":{\"type\":\"string\",\"description\":\"The location to get the weather for\"}}}}],\"max_tokens\":1000}"
                  }
                },
                {
                  "key": "gen_ai.request.provider",
                  "value": {
                    "stringValue": "openai"
                  }
                },
                {
                  "key": "gen_ai.request.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.request.type",
                  "value": {
                    "stringValue": "agent"
                  }
                },
                {
                  "key": "gen_ai.request.temperature",
                  "value": {
                    "doubleValue": 0.5
                  }
                },
                {
                  "key": "gen_ai.request.max_tokens",
                  "value": {
                    "intValue": 1000
                  }
                },
                {
                  "key": "gen_ai.system.instructions",
                  "value": {
                    "stringValue": "[{\"type\":\"text\",\"content\":\"Think step by step about the user question:\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":0}}}]"
                  }
                },
                {
                  "key": "gen_ai.input.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"content\":\"What is the weather in Barcelona?\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.output.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The user asked for the weather.\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.usage.input_tokens",
                  "value": {
                    "intValue": 19
                  }
                },
                {
                  "key": "gen_ai.usage.output_tokens",
                  "value": {
                    "intValue": 8
                  }
                },
                {
                  "key": "gen_ai.usage.prompt_tokens",
                  "value": {
                    "intValue": 19
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
                    "intValue": 8
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
              "parentSpanId": "ID_2",
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
                    "stringValue": "{\"provider\":\"openai\",\"model\":\"gpt-4o\",\"type\":\"agent\",\"temperature\":0.5,\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"description\":\"Get the weather for a given location\",\"parameters\":{\"location\":{\"type\":\"string\",\"description\":\"The location to get the weather for\"}}}}],\"max_tokens\":1000}"
                  }
                },
                {
                  "key": "gen_ai.request.provider",
                  "value": {
                    "stringValue": "openai"
                  }
                },
                {
                  "key": "gen_ai.request.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.request.type",
                  "value": {
                    "stringValue": "agent"
                  }
                },
                {
                  "key": "gen_ai.request.temperature",
                  "value": {
                    "doubleValue": 0.5
                  }
                },
                {
                  "key": "gen_ai.request.max_tokens",
                  "value": {
                    "intValue": 1000
                  }
                },
                {
                  "key": "gen_ai.system.instructions",
                  "value": {
                    "stringValue": "[{\"type\":\"text\",\"content\":\"Think step by step about the user question:\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":0}}},{\"type\":\"text\",\"content\":\"Think harder.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":3}}}]"
                  }
                },
                {
                  "key": "gen_ai.input.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"content\":\"What is the weather in Barcelona?\"}]},{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The user asked for the weather.\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.output.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The user has asked specifically for the weather in Barcelona.\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.usage.input_tokens",
                  "value": {
                    "intValue": 30
                  }
                },
                {
                  "key": "gen_ai.usage.output_tokens",
                  "value": {
                    "intValue": 16
                  }
                },
                {
                  "key": "gen_ai.usage.prompt_tokens",
                  "value": {
                    "intValue": 30
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
                    "intValue": 16
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
              "spanId": "ID_4",
              "parentSpanId": "ID_2",
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
                    "stringValue": "{\"provider\":\"openai\",\"model\":\"gpt-4o\",\"type\":\"agent\",\"temperature\":0.5,\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"description\":\"Get the weather for a given location\",\"parameters\":{\"location\":{\"type\":\"string\",\"description\":\"The location to get the weather for\"}}}}],\"max_tokens\":1000}"
                  }
                },
                {
                  "key": "gen_ai.request.provider",
                  "value": {
                    "stringValue": "openai"
                  }
                },
                {
                  "key": "gen_ai.request.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.request.type",
                  "value": {
                    "stringValue": "agent"
                  }
                },
                {
                  "key": "gen_ai.request.temperature",
                  "value": {
                    "doubleValue": 0.5
                  }
                },
                {
                  "key": "gen_ai.request.max_tokens",
                  "value": {
                    "intValue": 1000
                  }
                },
                {
                  "key": "gen_ai.system.instructions",
                  "value": {
                    "stringValue": "[{\"type\":\"text\",\"content\":\"Think step by step about the user question:\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":0}}},{\"type\":\"text\",\"content\":\"Think harder.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":3}}},{\"type\":\"text\",\"content\":\"Now think freely, remember, you are an agent.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":5}}}]"
                  }
                },
                {
                  "key": "gen_ai.input.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"content\":\"What is the weather in Barcelona?\"}]},{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The user asked for the weather.\"}]},{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The user has asked specifically for the weather in Barcelona.\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.output.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"I need to know the weather in Barcelona. I will use the get_weather tool.\"},{\"type\":\"tool_call\",\"id\":\"fake-tool-call-id-1\",\"name\":\"get_weather\",\"arguments\":{\"location\":\"Barcelona\"}}]}]"
                  }
                },
                {
                  "key": "gen_ai.usage.input_tokens",
                  "value": {
                    "intValue": 57
                  }
                },
                {
                  "key": "gen_ai.usage.output_tokens",
                  "value": {
                    "intValue": 19
                  }
                },
                {
                  "key": "gen_ai.usage.prompt_tokens",
                  "value": {
                    "intValue": 57
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
                    "intValue": 19
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
              "spanId": "ID_5",
              "parentSpanId": "ID_2",
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
                    "stringValue": "fake-tool-call-id-1"
                  }
                },
                {
                  "key": "gen_ai.tool.call.arguments",
                  "value": {
                    "stringValue": "{\"location\":\"Barcelona\"}"
                  }
                },
                {
                  "key": "gen_ai.tool.result.value",
                  "value": {
                    "stringValue": "{\"weather\":\"SUNNY\",\"confidence\":0.95}"
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
              "spanId": "ID_6",
              "parentSpanId": "ID_2",
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
                    "stringValue": "{\"provider\":\"openai\",\"model\":\"gpt-4o\",\"type\":\"agent\",\"temperature\":0.5,\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"description\":\"Get the weather for a given location\",\"parameters\":{\"location\":{\"type\":\"string\",\"description\":\"The location to get the weather for\"}}}}],\"max_tokens\":1000}"
                  }
                },
                {
                  "key": "gen_ai.request.provider",
                  "value": {
                    "stringValue": "openai"
                  }
                },
                {
                  "key": "gen_ai.request.model",
                  "value": {
                    "stringValue": "gpt-4o"
                  }
                },
                {
                  "key": "gen_ai.request.type",
                  "value": {
                    "stringValue": "agent"
                  }
                },
                {
                  "key": "gen_ai.request.temperature",
                  "value": {
                    "doubleValue": 0.5
                  }
                },
                {
                  "key": "gen_ai.request.max_tokens",
                  "value": {
                    "intValue": 1000
                  }
                },
                {
                  "key": "gen_ai.system.instructions",
                  "value": {
                    "stringValue": "[{\"type\":\"text\",\"content\":\"Think step by step about the user question:\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":0}}},{\"type\":\"text\",\"content\":\"Think harder.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":3}}},{\"type\":\"text\",\"content\":\"Now think freely, remember, you are an agent.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":5}}},{\"type\":\"text\",\"content\":\"Finally, answer the user question.\",\"_provider_metadata\":{\"_known_fields\":{\"messageIndex\":8}}}]"
                  }
                },
                {
                  "key": "gen_ai.input.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"content\":\"What is the weather in Barcelona?\"}]},{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The user asked for the weather.\"}]},{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The user has asked specifically for the weather in Barcelona.\"}]},{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"I need to know the weather in Barcelona. I will use the get_weather tool.\"},{\"type\":\"tool_call\",\"id\":\"fake-tool-call-id-1\",\"name\":\"get_weather\",\"arguments\":{\"location\":\"Barcelona\"}}]},{\"role\":\"tool\",\"parts\":[{\"type\":\"tool_call_response\",\"id\":\"fake-tool-call-id-1\",\"response\":\"{\\\"weather\\\":\\\"SUNNY\\\",\\\"confidence\\\":0.95}\",\"_provider_metadata\":{\"toolName\":\"get_weather\",\"isError\":false}}]}]"
                  }
                },
                {
                  "key": "gen_ai.output.messages",
                  "value": {
                    "stringValue": "[{\"role\":\"assistant\",\"parts\":[{\"type\":\"text\",\"content\":\"The weather in Barcelona is sunny.\"}]}]"
                  }
                },
                {
                  "key": "gen_ai.usage.input_tokens",
                  "value": {
                    "intValue": 93
                  }
                },
                {
                  "key": "gen_ai.usage.output_tokens",
                  "value": {
                    "intValue": 9
                  }
                },
                {
                  "key": "gen_ai.usage.prompt_tokens",
                  "value": {
                    "intValue": 93
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
                    "intValue": 9
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
              "spanId": "ID_2",
              "name": "prompt-fake-document-uuid",
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
                    "stringValue": "---\nprovider: openai\nmodel: gpt-4o\ntype: agent\ntemperature: 0.5\nmaxTokens: 1000\ntools:\n  - get_weather:\n      description: Get the weather for a given location\n      parameters:\n        location:\n          type: string\n          description: The location to get the weather for\n---   \n\n<step>\n  Think step by step about the user question:\n  <user> {{ question }} </user>\n</step>\n\n<step>\n  Think harder.\n</step>\n\n<step>\n  Now think freely, remember, you are an agent.\n</step>\n\n<step>\n  Finally, answer the user question.\n</step>"
                  }
                },
                {
                  "key": "gen_ai.request.parameters",
                  "value": {
                    "stringValue": "{\"question\":\"What is the weather in Barcelona?\"}"
                  }
                },
                {
                  "key": "latitude.commit_uuid",
                  "value": {
                    "stringValue": "fake-version-uuid"
                  }
                },
                {
                  "key": "latitude.document_uuid",
                  "value": {
                    "stringValue": "fake-document-uuid"
                  }
                },
                {
                  "key": "latitude.document_log_uuid",
                  "value": {
                    "stringValue": "DOC_LOG_UUID"
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
