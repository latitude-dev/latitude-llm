import { describe, expect, it } from "vitest"
import { cronJobFromSessionKey, deriveEnrichment, senderFromPrompt, TAG_MAX_COUNT } from "./context.ts"

const base = { pluginVersion: "1.0.0", subagentIds: [] as string[] }
const none = { tags: [], metadata: {} }

describe("deriveEnrichment", () => {
  it("derives tags from channel, agent and trigger", () => {
    const { tags } = deriveEnrichment({ ...base, ctx: { channel: "slack", agentId: "main", trigger: "user" } }, none)
    expect(tags).toEqual(["openclaw", "slack", "main"])
  })

  it("adds cron, subagent and operator tags, deduplicated and capped", () => {
    const { tags } = deriveEnrichment(
      { ...base, ctx: { agentId: "main", trigger: "cron" }, cron: { id: "daily" }, subagentIds: ["main", "main"] },
      { tags: ["main", ...Array.from({ length: 40 }, (_, i) => `t${i}`)], metadata: {} },
    )
    expect(tags.slice(0, 4)).toEqual(["openclaw", "main", "cron:daily", "subagent:main"])
    expect(tags).toHaveLength(TAG_MAX_COUNT)
  })

  it("keeps operator metadata but never lets it forge openclaw.* keys", () => {
    const { metadata } = deriveEnrichment(
      { ...base, ctx: { runId: "r", agentId: "main" }, sender: { id: "U1", name: "Alex" } },
      { tags: [], metadata: { deployment: "eu", "openclaw.run.id": "forged" } },
    )
    expect(metadata.deployment).toBe("eu")
    expect(metadata["openclaw.run.id"]).toBe("r")
    expect(metadata["openclaw.sender.name"]).toBe("Alex")
    expect(metadata["openclaw.plugin.version"]).toBe("1.0.0")
  })
})

describe("cronJobFromSessionKey", () => {
  it("parses isolated cron session keys", () => {
    expect(cronJobFromSessionKey("agent:main:cron:daily-report")).toBe("daily-report")
    expect(cronJobFromSessionKey("agent:main:cron:daily-report:run:abc")).toBe("daily-report")
    expect(cronJobFromSessionKey("agent:main:slack:channel:C1")).toBeUndefined()
    expect(cronJobFromSessionKey(undefined)).toBeUndefined()
  })
})

describe("senderFromPrompt", () => {
  it("reads the sender from the channel context block", () => {
    const prompt =
      'Conversation info: ⟦openclaw:ctx⟧\n```json\n{"chat_id":"user:U1","sender":{"id":"U1","name":"Alex"},"timestamp":"x"}\n```\n\nSystem: Slack DM from Alex\n\nhello'
    expect(senderFromPrompt(prompt)).toEqual({ id: "U1", name: "Alex", username: undefined })
    expect(senderFromPrompt("hello")).toBeUndefined()
    expect(senderFromPrompt(undefined)).toBeUndefined()
  })
})
