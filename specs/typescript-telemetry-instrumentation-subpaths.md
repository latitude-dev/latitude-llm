# TypeScript telemetry instrumentation subpaths

> **Documentation**: `dev-docs/telemetry-sdk.md`, `docs/telemetry/typescript.md`, `packages/telemetry/typescript/README.md`

## Context

Importing `Latitude` from `@latitude-data/telemetry` currently exposes a central registry whose statically discoverable dynamic imports reference every supported instrumentation. Application bundlers follow those imports even when `instrumentations` is empty. A minimal esbuild bundle is approximately 7 MB minified; `js-tiktoken`, pulled through the OpenAI instrumentation, contributes approximately 5.3 MB. The published package itself is approximately 443 KB unpacked, but installing it also installs every instrumentation dependency.

The build-time `neverBundle` setting only keeps instrumentation packages out of Latitude's published JavaScript. It does not prevent a downstream bundler from resolving the imports in Latitude's main entry.

## Goals

- Keep the main `@latitude-data/telemetry` entry free of references to provider and framework instrumentation implementations.
- Make each instrumentation an explicit subpath import.
- Ensure consumers install and bundle only the instrumentation dependencies they choose.
- Preserve instrumentation behavior, module normalization, token enrichment, provider registration, and `latitude.ready` ordering.
- Make the breaking migration explicit in types, runtime validation, examples, and documentation.
- Add automated bundle-isolation coverage so the package cannot silently regress.

## Non-goals

- Changing span attributes or provider-specific instrumentation behavior.
- Replacing Traceloop or Arize instrumentation implementations.
- Removing the OpenTelemetry runtime required by the core SDK.
- Preserving the object-map `instrumentations: { openai: OpenAI }` API. This is a major-version API change.
- Reducing the size of an application that explicitly opts into an instrumentation whose own dependency graph is large.

## Public API

The core package accepts already-created OpenTelemetry instrumentation instances:

```ts
import { Latitude } from "@latitude-data/telemetry"
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

await latitude.ready
const client = new OpenAI()
```

`InstrumentationsInput` becomes a readonly array of `Instrumentation` values. `registerLatitudeInstrumentations` continues to be exported from the main entry for consumers that own their tracer provider, but accepts this array directly and no longer loads implementations.

Each supported key receives a subpath and named factory:

| Previous key | Subpath | Factory |
| --- | --- | --- |
| `openai` | `@latitude-data/telemetry/instrumentations/openai` | `createOpenAIInstrumentation` |
| `openai-agents` | `@latitude-data/telemetry/instrumentations/openai-agents` | `createOpenAIAgentsInstrumentation` |
| `anthropic` | `@latitude-data/telemetry/instrumentations/anthropic` | `createAnthropicInstrumentation` |
| `bedrock` | `@latitude-data/telemetry/instrumentations/bedrock` | `createBedrockInstrumentation` |
| `cohere` | `@latitude-data/telemetry/instrumentations/cohere` | `createCohereInstrumentation` |
| `langchain` | `@latitude-data/telemetry/instrumentations/langchain` | `createLangChainInstrumentation` |
| `llamaindex` | `@latitude-data/telemetry/instrumentations/llamaindex` | `createLlamaIndexInstrumentation` |
| `togetherai` | `@latitude-data/telemetry/instrumentations/togetherai` | `createTogetherAIInstrumentation` |
| `vertexai` | `@latitude-data/telemetry/instrumentations/vertexai` | `createVertexAIInstrumentation` |
| `aiplatform` | `@latitude-data/telemetry/instrumentations/aiplatform` | `createAIPlatformInstrumentation` |

Factories accept the same LLM SDK module users previously placed in the object map. OpenAI and Anthropic retain their current normalization behavior. Factories return the OpenTelemetry `Instrumentation` interface so provider-specific implementation types do not leak through the core contract.

Passing the removed object-map shape must produce a clear runtime migration error rather than failing later inside OpenTelemetry registration.

## Dependency isolation

Provider and framework instrumentation packages move from regular dependencies to optional peer dependencies. The package README and product docs must list the additional package required by each subpath. Consumers explicitly install the selected instrumentation package alongside `@latitude-data/telemetry`.

`@opentelemetry/instrumentation` remains a core dependency because the main entry registers supplied instances. Other OpenTelemetry dependencies used by core exporting and tracing remain unchanged.

Each subpath must be an independent build entry and package export. No main-entry source file may import or re-export a provider subpath, including through a barrel that causes it to enter the core module graph.

## Registration and lifecycle

Instrumentation factories construct and manually instrument the consumer's SDK module before returning the instance. `Latitude` registers the resulting array against its selected tracer provider. `latitude.ready` remains a `Promise<void>` for compatibility with existing initialization ordering even though subpath factories remove asynchronous implementation loading.

An empty or omitted array registers nothing. Multiple selected instrumentations are registered together. Duplicate-instance behavior remains delegated to OpenTelemetry.

## Migration

Before:

```ts
import { Latitude } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey,
  instrumentations: { openai: OpenAI },
})
```

After:

```ts
import { Latitude } from "@latitude-data/telemetry"
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})
```

The migration also requires installing the implementation package documented for the selected instrumentation, for example `@traceloop/instrumentation-openai` for OpenAI.

All repository examples, public product docs, QA references, and tests using the old object map must migrate in the same change. The changelog must call out the major-version break and provide the before/after form.

## Verification

- Unit tests cover every factory, including OpenAI and Anthropic normalization and factory-specific options.
- Registration tests accept arrays, reject the removed object-map shape with migration guidance, and register against the supplied provider.
- Package build and typecheck succeed for the main entry and every subpath.
- A package-boundary test or script bundles a minimal core-only consumer and asserts that its metafile contains no `@traceloop`, `@arizeai`, LangChain, LangSmith, or `js-tiktoken` modules.
- A consumer importing one instrumentation resolves only that instrumentation's implementation graph.
- `npm pack --dry-run` confirms all declared subpath files and declarations are published.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Public contract and isolated entries

- [x] **P1-1**: Replace the object-map instrumentation contract with an instrumentation array.
- [x] **P1-2**: Add one independent subpath factory for every supported instrumentation.
- [x] **P1-3**: Add package exports and build entries for every subpath.
- [x] **P1-4**: Move instrumentation implementations to optional peer dependencies.
- [x] **P1-5**: Preserve clear runtime validation for callers using the removed API.

**Exit gate**:

- The core entry has no provider instrumentation references, every subpath builds, and TypeScript consumers can use the new API.

### Phase 2 - Tests and package-size guard

- [x] **P2-1**: Migrate and extend unit tests for array registration and factory construction.
- [x] **P2-2**: Add an automated core bundle-isolation regression check.
- [x] **P2-3**: Verify package build, typecheck, tests, and packed exports.

**Exit gate**:

- Automated evidence proves that a core-only consumer does not bundle optional instrumentations.

### Phase 3 - Migration material

- [x] **P3-1**: Migrate package examples and README snippets.
- [x] **P3-2**: Migrate product telemetry documentation and framework/provider snippets.
- [x] **P3-3**: Update the package changelog and durable telemetry SDK documentation.
- [x] **P3-4**: Update telemetry QA references affected by the API shape.

**Exit gate**:

- Repository search finds no active object-map examples and all user-facing migration instructions match the implemented exports.
