# @latitude-data/agent-sdk

Runtime-only PromptL agent SDK for Node and Edge. Load prompts from disk on Node, or register them in-memory on Edge.

## Install

```bash
pnpm add @latitude-data/agent-sdk ai promptl-ai
```

Install the provider package you plan to use (peer dependency):

```bash
pnpm add @ai-sdk/openai
```

## Node usage (filesystem loader)

```ts
import { runAgent } from '@latitude-data/agent-sdk'

const result = await runAgent('src/prompts/weather-agent', {
  model: 'openai/gpt-4o-mini',
  parameters: {
    location: 'San Francisco, CA',
  },
})

console.log(result.text)
```

By default, prompts are loaded from `process.cwd()` and the `.promptl` extension is optional.

### Custom runtime

```ts
import { createAgentRuntime, fsPromptLoader } from '@latitude-data/agent-sdk'

const runtime = createAgentRuntime({
  loader: fsPromptLoader({ root: '/app/prompts' }),
  defaults: {
    model: 'openai/gpt-4o-mini',
  },
})

const result = await runtime.run('weather-agent', {
  parameters: { location: 'San Francisco, CA' },
})
```

## Edge usage (registry loader)

```ts
import { registerPrompts, runAgent } from '@latitude-data/agent-sdk/edge'

registerPrompts({
  'weather-agent':
    '<system>Return a forecast.</system>\n<user>{{location}}</user>\n',
})

const result = await runAgent('weather-agent', {
  model: 'openai/gpt-4o-mini',
  parameters: { location: 'San Francisco, CA' },
})
```

### import.meta.glob helper

```ts
import { registerPromptModules } from '@latitude-data/agent-sdk/edge'

await registerPromptModules(
  import.meta.glob('/src/prompts/**/*.promptl', { eager: true, as: 'raw' }),
  { root: '/src/prompts' },
)
```

## Runtime options

```ts
type RunAgentOptions = {
  model?: string
  parameters?: Record<string, unknown>
  tools?: ToolHandlers
  agents?: string[]
  maxSteps?: number
  stream?: boolean
  signal?: AbortSignal
}
```

### Model resolution

Model overrides use a single `<provider>/<model>` string, for example: `openai/gpt-4o-mini`.

Precedence: `options.model` -> PromptL `provider+model` -> `defaults.model`.

### Tools and agents

- PromptL `tools:` entries map to handlers you provide via `tools` or `runtime.registerTools`.
- PromptL `agents:` entries become tool calls that run other prompts using the same runtime.

## Environment variables

API keys are resolved from the provider env hints (for example `OPENAI_API_KEY`) or your custom `secrets` resolver.

## Notes

- `<step>` tags are not supported and will throw `StepsNotSupportedError`.
- Edge runtimes cannot read from the filesystem; use `registerPrompts` or a custom registry loader.
