// @vitest-environment jsdom
import type { RedactionRule } from "@domain/shared"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const validateRedactionRuleDraft = vi.fn()

vi.mock("../../../../../../domains/projects/projects.functions.ts", () => ({
  validateRedactionRuleDraft: (input: unknown) => validateRedactionRuleDraft(input),
}))

const { RedactionRuleSheet } = await import("./redaction-rule-sheet.tsx")

afterEach(() => {
  cleanup()
  validateRedactionRuleDraft.mockReset()
})

const PATTERN: RedactionRule = {
  id: "r1",
  label: "ACCOUNT_NUMBER",
  kind: "pattern",
  pattern: "ACCT-\\d{9}",
  validatorVersion: 1,
}

const verdict = (ok: boolean, validatorVersion = 2) => ({
  ok,
  errors: ok ? [] : [{ code: "adjacent_quantifier", message: "backtracks" }],
  slowestProbeMs: 0,
  validatorVersion,
})

const setup = () => {
  const onSave = vi.fn()
  render(<RedactionRuleSheet open rule={PATTERN} onClose={vi.fn()} onSave={onSave} />)

  const save = () => screen.getByRole("button", { name: "Save rule" }) as HTMLButtonElement

  return { onSave, save }
}

describe("RedactionRuleSheet", () => {
  /**
   * The verdict on screen and the state of the button have to agree. They did not: the previous
   * draft's verdict stayed in state through the debounce and the request, so Save was live while
   * the panel read "Checking the rule…" — and for a pattern rule Save stamps `validatorVersion`
   * off that verdict, attributing the old draft's approval to a pattern nobody had checked.
   */
  it("does not offer Save for a pattern whose verdict has not arrived", async () => {
    validateRedactionRuleDraft.mockResolvedValue(verdict(true))
    const { save } = setup()

    await waitFor(() => expect(save().disabled).toBe(false))

    fireEvent.change(screen.getByLabelText("Pattern"), { target: { value: "\\d+\\d+" } })

    expect(save().disabled).toBe(true)
    expect(screen.getByText("Checking the rule…")).toBeDefined()
  })

  it("stamps the validator version from the verdict for the pattern being saved", async () => {
    validateRedactionRuleDraft.mockResolvedValue(verdict(true, 7))
    const { onSave, save } = setup()

    await waitFor(() => expect(save().disabled).toBe(false))
    save().click()

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ validatorVersion: 7 }))
  })

  it("keeps Save disabled once the verdict rejects the rule", async () => {
    validateRedactionRuleDraft.mockResolvedValue(verdict(false))
    const { save } = setup()

    await waitFor(() => expect(screen.getByText(/backtracks/)).toBeDefined())

    expect(save().disabled).toBe(true)
  })
})
