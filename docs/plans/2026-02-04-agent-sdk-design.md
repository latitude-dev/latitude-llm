# Agent SDK Runtime Design

Date: 2026-02-04
Status: Draft

## Context

We want a code-first agent runtime that executes PromptL templates stored alongside application code. The runtime will use `promptl-ai` to parse/render prompts, Vercel's `ai` SDK to call providers, and `models.dev` to resolve model metadata. Developers can override the model at runtime using a single `<provider>/<model>` string. We target Node and Edge runtimes with identical APIs and behavior.

## Goals

- Execute `.promptl` files locally (no gateway dependency)
- Support PromptL config, variables, conditionals, tools, agents, and prompt references
- Provide a single runtime override: `model: '<provider>/<model>'`
- Offer simple top-level runners (`runAgent` and `runAgent` in `/edge`)
- Provide a runtime factory for advanced scenarios
- Keep the runtime small, predictable, and dependency-light

## Non-Goals

- No `<step>` chain support at launch
- No workflow engine, memory store, or persistence layer
- No prompt editing UI or server-side prompt management
- No built-in evals, traces, or gateway logs

## Constraints

- Edge environment cannot access the filesystem
- Provider credentials must be supplied at runtime
- PromptL agent sub-prompts must be resolved from local files or registry

## Architecture Overview

Components:

- PromptLoader: resolves `.promptl` content from disk (Node) or registry (Edge)
- PromptCompiler: parses PromptL with `promptl-ai` and renders messages/config
- ModelResolver: uses `models.dev` to resolve provider/model metadata
- ProviderFactory: builds Vercel AI SDK providers using a secrets resolver with env fallback
- ToolRegistry: maps PromptL tool specs to runtime handlers
- AgentExecutor: runs the agent loop (single pass + tool calls)
- EventStream: emits step/tool/model events for streaming and observability

Data flow:

1. Normalize prompt path (trim leading `/`, ensure `.promptl`)
2. Load root prompt and resolve `<prompt path="...">` references
3. Resolve `config.agents` (or runtime override `agents`) into agent tools
4. Parse PromptL, validate config, and reject `<step>` usage
5. Compute effective config and resolve `modelId`
6. Execute model call, handle tool calls, continue until completion or `maxSteps`
7. Apply `schema` (if any) to the final agent output

## Prompt Loading

Two loaders are supported:

- Node: `fsPromptLoader({ root })` reads from disk
- Edge: registry loader reads from a pre-registered prompt map

Prompt path rules:

- Leading `/` is allowed and normalized away
- `.promptl` extension is optional
- Relative paths resolve against the current prompt's path

## Model Resolution & Credentials

- Runtime override uses a single `model` string in `<provider>/<model>` format
- Precedence: `options.model` -> PromptL `provider+model` -> `defaults.model`
- `models.dev` validates the model and returns provider metadata
- A `secrets` resolver is called with `{ provider, model, modelId }`
- If `secrets` returns undefined, env fallback is used (based on metadata hints)
- Missing credentials raise `ProviderAuthError` before the first model call

## Execution Model (No `<step>`)

We execute prompts as a single pass:

- Render PromptL to messages/config with `promptl-ai`
- Run the model once per loop iteration
- Handle tool calls by invoking runtime handlers and injecting tool messages
- Stop when the model returns a final response or `maxSteps` is reached

Any prompt containing `<step>` fails early with `StepsNotSupportedError`.

## Tools and Sub-Agents

- Tool specs are defined in PromptL config (`tools:`)
- Runtime handlers are provided via `options.tools` or `runtime.registerTools`
- Missing handlers cause `MissingToolHandlerError`
- Sub-agents are defined in PromptL config (`agents:`) or `options.agents`
- Sub-agents are exposed as tools; when invoked they run via the same executor

## Public API

Exports (Node default entry):

- `runAgent(promptPath, options?)`
- `createAgentRuntime(config)`
- `fsPromptLoader({ root })`

Exports (`/edge` entry):

- `runAgent(promptPath, options?)`
- `registerPrompts(map, { root })`
- `createPromptRegistry(map, { root })`

Run options:

- `model?: string` (single override, `<provider>/<model>`)
- `parameters?: Record<string, unknown>`
- `tools?: ToolHandlers`
- `agents?: string[]` (override PromptL config)
- `maxSteps?: number`
- `stream?: boolean`
- `signal?: AbortSignal`

## Errors

- `MissingModelError`
- `UnknownModelError`
- `MissingToolHandlerError`
- `StepsNotSupportedError`
- `MissingRegistryError`
- `PromptNotFoundError`
- `ProviderAuthError`

## Edge Considerations

- No filesystem access; prompts must be registered
- Providers must be Edge compatible
- Secrets resolver must be Edge-safe (no Node APIs)

## Future Work

- `<step>` chain execution support
- Structured streaming for tool calls and agent trace events
- Optional memory adapter and persistence hooks
- Built-in adapters for common tool sets
