import { describe, expect, it } from "vitest"
import { admitsTopic, NOTIFICATION_GROUP_META, NOTIFICATION_TOPIC_META } from "./notification-preferences.ts"

describe("admitsTopic", () => {
  it("never filters a notification that carries no topic", () => {
    expect(admitsTopic(undefined, null)).toBe(true)
    expect(admitsTopic({ "signal.discovered": false }, null)).toBe(true)
  })

  it("falls back to the topic's default when the user never touched the switch", () => {
    expect(admitsTopic(undefined, "signal.discovered")).toBe(true)
    expect(admitsTopic({}, "signal.discovered")).toBe(true)
    expect(admitsTopic(undefined, "signal.reprioritized")).toBe(false)
    expect(admitsTopic({}, "signal.reprioritized")).toBe(false)
    // An unrelated topic's switch must not opt the user into a default-off one.
    expect(admitsTopic({ "signal.discovered": true }, "signal.reprioritized")).toBe(false)
  })

  it("lets a stored preference win over the default in both directions", () => {
    expect(admitsTopic({ "signal.reprioritized": true }, "signal.reprioritized")).toBe(true)
    expect(admitsTopic({ "signal.discovered": false }, "signal.discovered")).toBe(false)
  })
})

describe("NOTIFICATION_TOPIC_META", () => {
  it("offers every topic under exactly one group", () => {
    const declared = Object.values(NOTIFICATION_GROUP_META).flatMap((meta) => meta.topics)
    expect([...declared].sort()).toEqual(Object.keys(NOTIFICATION_TOPIC_META).sort())
  })
})
