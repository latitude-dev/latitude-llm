import { createAgent, type FlueContext, type WorkflowRouteHandler } from "@flue/runtime"
import * as v from "valibot"
import "../telemetry.ts"

export const route: WorkflowRouteHandler = async (_c, next) => next()

const translator = createAgent(() => ({
  model: "openai/gpt-4o-mini",
  instructions: "You are a precise translator. Return only the requested translation.",
}))

export async function run({ init, payload }: FlueContext<{ text: string; language: string }>) {
  const harness = await init(translator)
  const session = await harness.session()

  const { data } = await session.prompt(`Translate this to ${payload.language}: "${payload.text}"`, {
    result: v.object({
      translation: v.string(),
      confidence: v.picklist(["low", "medium", "high"]),
    }),
  })

  return data
}
