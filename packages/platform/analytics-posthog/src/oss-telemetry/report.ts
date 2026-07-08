import { parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { createPostHogClient } from "../client.ts"
import { loadOssTelemetryConfig } from "./config.ts"
import { OSS_TELEMETRY_EVENT, OSS_TELEMETRY_HEARTBEAT_TTL_SECONDS, ossTelemetryHeartbeatKey } from "./constants.ts"
import { deriveDeploymentId } from "./deployment-id.ts"

interface ReportOssDeploymentHeartbeatInput {
  readonly serviceName: string
  readonly redis?: {
    set(key: string, value: string, mode: "EX", ttl: number, nx: "NX"): Promise<string | null>
  }
}

const readHostname = (rawUrl: string | undefined): string | undefined => {
  if (!rawUrl) return undefined
  try {
    return new URL(rawUrl).hostname
  } catch {
    return undefined
  }
}

const readVersion = (): string | undefined => {
  const imageTag = Effect.runSync(parseEnvOptional("LAT_IMAGE_TAG", "string"))
  if (imageTag) return imageTag

  const ddVersion = process.env.DD_VERSION?.trim()
  if (ddVersion) return ddVersion

  const gitSha = process.env.DD_GIT_COMMIT_SHA?.trim()
  if (gitSha) return gitSha

  return undefined
}

const shouldSendHeartbeat = async (
  redis: ReportOssDeploymentHeartbeatInput["redis"],
  deploymentId: string,
): Promise<boolean> => {
  if (!redis) return true

  const key = ossTelemetryHeartbeatKey(deploymentId)
  const acquired = await redis.set(key, "1", "EX", OSS_TELEMETRY_HEARTBEAT_TTL_SECONDS, "NX")
  return acquired === "OK"
}

export const reportOssDeploymentHeartbeat = async (input: ReportOssDeploymentHeartbeatInput): Promise<void> => {
  const config = Effect.runSync(loadOssTelemetryConfig)
  if (!config) return

  const deploymentId = deriveDeploymentId()
  if (!deploymentId) return

  if (!(await shouldSendHeartbeat(input.redis, deploymentId))) return

  const webHost = readHostname(Effect.runSync(parseEnvOptional("LAT_WEB_URL", "string")))
  const version = readVersion()

  const client = createPostHogClient(config)
  try {
    await client.capture({
      distinctId: `deployment_${deploymentId}`,
      event: OSS_TELEMETRY_EVENT,
      properties: {
        $process_person_profile: false,
        deploymentId,
        service: input.serviceName,
        nodeVersion: process.version,
        ...(version ? { version } : {}),
        ...(webHost ? { webHost } : {}),
      },
    })
    await client.shutdown()
  } catch {
    // Best-effort telemetry must never affect service startup.
  }
}
