import { createLogger } from "@repo/observability"

const logger = createLogger("workflows-activities")

export const greet = async (name: string): Promise<string> => {
  logger.info("greet activity", { name })
  return `Hello, ${name}!`
}
