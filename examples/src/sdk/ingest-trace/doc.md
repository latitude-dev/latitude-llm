---
title: Ingest traces
description: Learn how to backfill historical LLM traces to Latitude using manual instrumentation
---

## Overview

Use the Telemetry SDK's manual instrumentation to backfill historical LLM logs into Latitude's traces database. This is useful when you have existing logs from LLM calls and want to import them with their original timestamps and structure.

## Span Types

The example demonstrates creating several span types:

- **Prompt span**: The root span representing a prompt execution
- **Completion span**: A child span representing the LLM completion
- **Tool spans**: Child spans representing tool/function calls made by the model

## Timestamp Support

For backfilling historical data, you can specify exact timestamps:

- `startTime`: When the span started (Date object in TypeScript, Unix timestamp in Python)
- `endTime`: When the span ended (passed to the `end()` method)

This allows traces to show accurate durations based on your original log data.

## Span Attributes

### Prompt Span
- `documentLogUuid`: A unique identifier for this log entry (UUID v4)
- `promptUuid`: The path of the prompt in your project
- `projectId`: Your Latitude project ID
- `versionUuid`: The version UUID (use "live" for the published version)
- `template`: The prompt template content
- `parameters`: Parameters used to render the template
- `source`: The source of the log (use `LogSources.API`)
- `startTime`: When the prompt execution started

### Completion Span
- `provider`: The LLM provider name (e.g., "openai", "anthropic")
- `model`: The model name (e.g., "gpt-4o-mini")
- `input`: The input messages array
- `startTime`: When the LLM call started
- `output`: The output messages array (when ending)
- `tokens`: Token usage information
- `finishReason`: The completion finish reason
- `endTime`: When the LLM call completed

### Tool Span
- `name`: The tool/function name
- `call.id`: The unique call ID
- `call.arguments`: The arguments passed to the tool
- `startTime`: When the tool execution started
- `result.value`: The tool result (when ending)
- `result.isError`: Whether the tool call failed
- `endTime`: When the tool execution completed

## Prompt

In this example, the specific prompt content is not important—you just need to have prompts created in a Latitude project with matching paths.

[PROMPTS]

## Code

The example simulates a fake logs database with multiple entries including:
- Simple completions without tools
- Completions with single tool calls (e.g., weather lookup)
- Completions with multiple tool calls (e.g., search + save)

[CODE]
