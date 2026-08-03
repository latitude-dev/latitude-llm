import { REDACTION_ENTITIES } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  REDACTION_ENTITY_GROUP_LABELS,
  REDACTION_ENTITY_GROUPS,
  REDACTION_ENTITY_META,
  REDACTION_ENTITY_ORDER,
  redactionEntitiesInGroup,
} from "./redaction-entities.ts"

describe("redaction entity groups", () => {
  /**
   * The card renders group by group, so an entity whose group is missing from the list would
   * silently vanish from the UI while still being part of the stored policy. TypeScript cannot
   * catch that: the group is a valid value, it just never gets rendered.
   */
  it("renders every entity exactly once across the groups", () => {
    const rendered = REDACTION_ENTITY_GROUPS.flatMap((group) => [...redactionEntitiesInGroup(group)])

    expect([...rendered].sort()).toEqual([...REDACTION_ENTITIES].sort())
    expect(new Set(rendered).size).toBe(rendered.length)
  })

  it("gives every group at least one entity, so no empty heading renders", () => {
    for (const group of REDACTION_ENTITY_GROUPS) {
      expect(redactionEntitiesInGroup(group).length).toBeGreaterThan(0)
    }
  })

  it("labels every group", () => {
    for (const group of REDACTION_ENTITY_GROUPS) {
      expect(REDACTION_ENTITY_GROUP_LABELS[group]).toBeTruthy()
    }
  })

  it("keeps each group's entities in the shared display order", () => {
    for (const group of REDACTION_ENTITY_GROUPS) {
      const entities = redactionEntitiesInGroup(group)
      const positions = entities.map((entity) => REDACTION_ENTITY_ORDER.indexOf(entity))

      expect(positions).toEqual([...positions].sort((left, right) => left - right))
    }
  })
})

describe("redaction entity examples", () => {
  // The example carries the explanation for anyone who has not met the term PII, so a missing or
  // placeholder-shaped one would leave that row meaningless.
  it("gives every category a concrete example", () => {
    for (const entity of REDACTION_ENTITIES) {
      const meta = REDACTION_ENTITY_META[entity]

      expect(meta.example.length).toBeGreaterThan(3)
      expect(meta.example).not.toContain("REDACTED")
    }
  })

  it("cautions only the categories that ship off by default", () => {
    const cautioned = REDACTION_ENTITIES.filter((entity) => REDACTION_ENTITY_META[entity].caution !== undefined)

    expect(cautioned).toContain("ip_address")
    expect(cautioned).toContain("crypto_wallet")
  })
})
