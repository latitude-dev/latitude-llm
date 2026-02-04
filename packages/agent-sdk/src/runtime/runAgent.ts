import { createAgentRuntime } from './createAgentRuntime'
import { fsPromptLoader } from '../loaders/fsPromptLoader'
import type { RunAgentOptions } from '../types'

const defaultRuntime = createAgentRuntime({
  loader: fsPromptLoader(),
  defaults: {
    model: process.env.LATITUDE_AGENT_MODEL,
  },
})

/** Runs a PromptL agent using the default Node runtime. */
export async function runAgent(promptPath: string, options?: RunAgentOptions) {
  return defaultRuntime.run(promptPath, options)
}
