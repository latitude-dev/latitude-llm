// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DebouncedInput } from "./debounced-input.tsx"

afterEach(cleanup)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const type = (text: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value: text } })
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe("DebouncedInput", () => {
  it("reports the typed value once typing pauses", () => {
    const onDebouncedChange = vi.fn()
    render(<DebouncedInput value="" onDebouncedChange={onDebouncedChange} />)

    type("acme")
    expect(onDebouncedChange).not.toHaveBeenCalled()

    advance(300)
    expect(onDebouncedChange).toHaveBeenCalledWith("acme")
  })

  /**
   * The reason the flush exists: collapsing the section, closing the filters sidebar, or filtering
   * the section out of a sidebar search all unmount the input, and the edit must survive that.
   */
  it("reports the typed value when it unmounts before the debounce fires", () => {
    const onDebouncedChange = vi.fn()
    const { unmount } = render(<DebouncedInput value="" onDebouncedChange={onDebouncedChange} />)

    type("acme")
    advance(100)
    unmount()

    expect(onDebouncedChange).toHaveBeenCalledWith("acme")
  })

  it("reports the latest keystroke, not an earlier one, when unmounted mid-debounce", () => {
    const onDebouncedChange = vi.fn()
    const { unmount } = render(<DebouncedInput value="" onDebouncedChange={onDebouncedChange} />)

    type("ac")
    advance(200)
    type("acme")
    advance(100)
    unmount()

    expect(onDebouncedChange).toHaveBeenCalledTimes(1)
    expect(onDebouncedChange).toHaveBeenCalledWith("acme")
  })

  it("does not report again on unmount once the debounce already fired", () => {
    const onDebouncedChange = vi.fn()
    const { unmount } = render(<DebouncedInput value="" onDebouncedChange={onDebouncedChange} />)

    type("acme")
    advance(300)
    unmount()

    expect(onDebouncedChange).toHaveBeenCalledTimes(1)
  })

  it("reports nothing on unmount when the user never typed", () => {
    const onDebouncedChange = vi.fn()
    const { unmount } = render(<DebouncedInput value="acme" onDebouncedChange={onDebouncedChange} />)

    unmount()

    expect(onDebouncedChange).not.toHaveBeenCalled()
  })

  it("clears immediately from the clear button", () => {
    const onDebouncedChange = vi.fn()
    render(<DebouncedInput value="acme" onDebouncedChange={onDebouncedChange} />)

    fireEvent.click(screen.getByRole("button"))

    expect(onDebouncedChange).toHaveBeenCalledWith("")
  })
})
