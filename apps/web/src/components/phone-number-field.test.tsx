// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { detectCallingCode } from "../lib/phone-countries.ts"
import { PhoneNumberField } from "./phone-number-field.tsx"

afterEach(cleanup)

function Harness({ initialCallingCode = "" }: { readonly initialCallingCode?: string }) {
  const [callingCode, setCallingCode] = useState(initialCallingCode)
  const [nationalNumber, setNationalNumber] = useState("")
  return (
    <>
      <PhoneNumberField
        label="Phone number (optional)"
        description="Helpful if we need to reach you about your setup."
        callingCode={callingCode}
        nationalNumber={nationalNumber}
        onCallingCodeChange={setCallingCode}
        onNationalNumberChange={setNationalNumber}
      />
      <output data-testid="state">{`${callingCode}|${nationalNumber}`}</output>
    </>
  )
}

const state = () => screen.getByTestId("state").textContent

describe("PhoneNumberField", () => {
  // Asserts the detection is plumbed through on mount; which code it lands on depends on the runner's zone.
  it("defaults the calling code from the browser timezone", async () => {
    const detected = detectCallingCode()
    render(<Harness />)

    if (detected) await waitFor(() => expect(state()).toBe(`${detected}|`))
    else expect(state()).toBe("|")
  })

  it("shows the bare calling code on the trigger, with no country flag", () => {
    render(<Harness initialCallingCode="1" />)

    const trigger = screen.getByRole("button", { name: /calling code/i })
    expect(trigger.textContent).toBe("+1")
    expect(trigger.textContent).not.toMatch(/\p{Regional_Indicator}/u)
  })

  it("lets the user search by country and stores only the calling code", async () => {
    render(<Harness initialCallingCode="34" />)

    fireEvent.click(screen.getByRole("button", { name: /calling code/i }))
    const search = await screen.findByPlaceholderText("Search country or code")
    fireEvent.change(search, { target: { value: "Germany" } })
    fireEvent.click(await screen.findByText("Germany +49"))

    await waitFor(() => expect(state()).toBe("49|"))
  })

  it("finds the United Kingdom by an alias its name does not contain", async () => {
    render(<Harness initialCallingCode="34" />)

    fireEvent.click(screen.getByRole("button", { name: /calling code/i }))
    fireEvent.change(await screen.findByPlaceholderText("Search country or code"), { target: { value: "UK" } })

    fireEvent.click(await screen.findByText("United Kingdom +44"))
    await waitFor(() => expect(state()).toBe("44|"))
  })

  it("follows a pasted international prefix", async () => {
    render(<Harness initialCallingCode="34" />)

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "+441234567890" } })

    await waitFor(() => expect(state()).toBe("44|1234567890"))
  })

  it("warns about a trunk zero without rewriting what the user typed", async () => {
    render(<Harness initialCallingCode="44" />)

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "07700 900000" } })

    await waitFor(() => expect(state()).toBe("44|07700 900000"))
    expect(await screen.findByText(/without the leading 0/i)).toBeDefined()
    expect(screen.getByText(/\+4407700900000/)).toBeDefined()
  })

  it("stays silent about a leading zero for Italy", async () => {
    render(<Harness initialCallingCode="39" />)

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "06 1234 5678" } })

    await waitFor(() => expect(state()).toBe("39|06 1234 5678"))
    expect(screen.queryByText(/without the leading/i)).toBeNull()
  })

  it("keeps only phone formatting characters in the national number", async () => {
    render(<Harness initialCallingCode="34" />)

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "612 34 abc 56-78" } })

    await waitFor(() => expect(state()).toBe("34|612 34  56-78"))
  })
})
