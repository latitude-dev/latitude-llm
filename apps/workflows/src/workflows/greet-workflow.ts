import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

const { greet } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
})

export const greetWorkflow = async (name: string): Promise<string> => {
  return await greet(name)
}
