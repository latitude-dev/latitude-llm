// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RedactionIdentityChoice } from "./redaction-identity-choice.tsx"

afterEach(cleanup)

const setup = (value: "keep" | "pseudonymize" = "keep") => {
  const onChange = vi.fn()
  render(<RedactionIdentityChoice idPrefix="test" value={value} onChange={onChange} />)

  return { onChange, options: screen.getAllByRole("radio") as HTMLInputElement[] }
}

describe("RedactionIdentityChoice", () => {
  it("offers both options at once, which is the point of not using a dropdown", () => {
    const { options } = setup()

    expect(options).toHaveLength(2)
  })

  /**
   * The decision turns on whether per-user analytics survive, so both consequences have to be
   * readable without opening anything.
   */
  it("states what each option stores and what still works", () => {
    setup()

    expect(screen.getByText("anon_3f9a2b7c1d4e5f60")).toBeDefined()
    expect(screen.getByText(/Searching and grouping by user work/)).toBeDefined()
    expect(screen.getByText(/Grouping and per-user counts still work/)).toBeDefined()
  })

  it("shows the same input above each outcome, so the two are comparable", () => {
    setup()

    expect(screen.getAllByText("ada@acme.com").length).toBeGreaterThanOrEqual(2)
  })

  it("marks only the selected option", () => {
    const { options } = setup("pseudonymize")
    const checked = options.filter((option) => option.checked)

    expect(checked).toHaveLength(1)
    expect(checked[0]?.id).toBe("test-identities-pseudonymize")
  })

  // Sharing a name is what gives the group arrow-key navigation.
  it("puts both options in one radio group", () => {
    const { options } = setup()

    expect(new Set(options.map((option) => option.name)).size).toBe(1)
  })

  it("reports the option the user picked", () => {
    const { onChange, options } = setup("keep")
    const pseudonymize = options.find((option) => option.id === "test-identities-pseudonymize")
    pseudonymize?.click()

    expect(onChange).toHaveBeenCalledWith("pseudonymize")
  })

  it("takes no input when disabled", () => {
    const onChange = vi.fn()
    render(<RedactionIdentityChoice idPrefix="test" value="keep" disabled onChange={onChange} />)
    for (const option of screen.getAllByRole("radio")) option.click()

    expect(onChange).not.toHaveBeenCalled()
  })

  // Lucide renders an svg per icon; a renamed or dropped export would leave the cards wordy and flat.
  it("gives each option an icon", () => {
    const { container } = render(<RedactionIdentityChoice idPrefix="icons" value="keep" onChange={vi.fn()} />)

    expect(container.querySelectorAll("svg")).toHaveLength(2)
  })

  // The browser cannot know whether a deployment configured one, so the caveat is always stated.
  it("warns that a missing pseudonym secret removes the identifier instead", () => {
    setup("pseudonymize")

    expect(screen.getByText(/no pseudonym secret configured/)).toBeDefined()
  })
})
