// @vitest-environment jsdom
import type { RedactionRule } from "@domain/shared"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { decodeRules, encodeRules } from "../../../../../../domains/projects/redaction-rule-drafts.ts"
import { RedactionRulesSection } from "./redaction-rules-section.tsx"

afterEach(cleanup)

const TERMS: RedactionRule = { id: "r1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-1234"] }

const setup = (rules: RedactionRule[] = [TERMS], disabled = false) => {
  const onChange = vi.fn()
  render(<RedactionRulesSection idPrefix="test" value={encodeRules(rules)} disabled={disabled} onChange={onChange} />)

  /** What the component wrote back, decoded — the page stores this as canonical JSON. */
  const written = () => decodeRules(onChange.mock.calls.at(-1)?.[0] as string)

  return { onChange, written }
}

describe("RedactionRulesSection", () => {
  /**
   * The row is deliberately the same shape as a category row above it: both answer "what to
   * redact". An earlier version used a "Turn off" text button, which is an interaction the rest of
   * the product does not have.
   */
  it("enables a rule from a checkbox, like the categories above it", () => {
    const { written } = setup()
    const checkbox = screen.getByRole("checkbox", { name: "ACCOUNT_NUMBER" })

    expect(checkbox).toBeDefined()
    checkbox.click()

    expect(written()[0]).toMatchObject({ id: "r1", enabled: false })
  })

  it("re-enables a disabled rule from the same checkbox", () => {
    const { written } = setup([{ ...TERMS, enabled: false }])
    screen.getByRole("checkbox", { name: "ACCOUNT_NUMBER" }).click()

    expect(written()[0]).toMatchObject({ id: "r1", enabled: true })
  })

  it("treats a rule with no explicit enabled flag as on", () => {
    setup()

    expect(screen.getByRole("checkbox", { name: "ACCOUNT_NUMBER" }).getAttribute("aria-checked")).toBe("true")
  })

  it("names the kind and what the rule matches", () => {
    setup()

    expect(screen.getByText(/Exact terms/)).toBeDefined()
    expect(screen.getByText("ACME-1234")).toBeDefined()
  })

  it("removes a rule", () => {
    const { written } = setup([TERMS, { ...TERMS, id: "r2", label: "STAFF_ID" }])
    screen.getByRole("button", { name: "Remove ACCOUNT_NUMBER" }).click()

    expect(written().map((rule) => rule.id)).toEqual(["r2"])
  })

  it("warns when two rules share a label, since their counts are reported together", () => {
    setup([TERMS, { ...TERMS, id: "r2" }])

    expect(screen.getAllByText(/reported together/).length).toBeGreaterThan(0)
  })

  it("offers no editing controls at all when disabled", () => {
    setup([TERMS], true)

    expect(screen.queryByRole("button", { name: "Add rule" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Remove ACCOUNT_NUMBER" })).toBeNull()
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "ACCOUNT_NUMBER" }).disabled).toBe(true)
  })

  it("says so when there are no rules rather than rendering an empty list", () => {
    setup([])

    expect(screen.getByText("No custom rules yet.")).toBeDefined()
  })
})
