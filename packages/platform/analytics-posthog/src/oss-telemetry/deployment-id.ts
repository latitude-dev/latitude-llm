import { createHash } from "node:crypto"
import { parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export const deriveDeploymentId = (): string | undefined => {
  const authSecret = Effect.runSync(parseEnvOptional("LAT_BETTER_AUTH_SECRET", "string"))
  if (!authSecret) return undefined
  return createHash("sha256").update(authSecret).digest("hex").slice(0, 32)
}
