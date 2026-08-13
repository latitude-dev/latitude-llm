// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NumberRangeFilter } from "./number-range-filter.tsx"

afterEach(cleanup)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const typeMin = (text: string) => fireEvent.change(screen.getByPlaceholderText("Min"), { target: { value: text } })
const typeMax = (text: string) => fireEvent.change(screen.getByPlaceholderText("Max"), { target: { value: text } })
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

/** Mirrors how the filter builders own the range: every commit flows back in as props. */
function ControlledRange({ onRangeChange }: { readonly onRangeChange: (min?: number, max?: number) => void }) {
  const [range, setRange] = useState<{ min: number | undefined; max: number | undefined }>({
    min: undefined,
    max: undefined,
  })
  return (
    <NumberRangeFilter
      minValue={range.min}
      maxValue={range.max}
      onRangeChange={(min, max) => {
        setRange({ min, max })
        onRangeChange(min, max)
      }}
    />
  )
}

describe("NumberRangeFilter", () => {
  it("reports the range once typing pauses", () => {
    const onRangeChange = vi.fn()
    render(<NumberRangeFilter minValue={undefined} maxValue={undefined} onRangeChange={onRangeChange} />)

    typeMin("5")
    expect(onRangeChange).not.toHaveBeenCalled()

    advance(400)
    expect(onRangeChange).toHaveBeenCalledWith(5, undefined)
  })

  /**
   * The reason the flush exists: collapsing the section, closing the filters sidebar, switching to
   * the percentile tab, or filtering the section out of a sidebar search all unmount these inputs.
   */
  it("reports the range when it unmounts before the debounce fires", () => {
    const onRangeChange = vi.fn()
    const { unmount } = render(
      <NumberRangeFilter minValue={undefined} maxValue={undefined} onRangeChange={onRangeChange} />,
    )

    typeMin("5")
    advance(100)
    unmount()

    expect(onRangeChange).toHaveBeenCalledWith(5, undefined)
  })

  it("keeps both bounds when min and max are typed inside one debounce window", () => {
    const onRangeChange = vi.fn()
    const { unmount } = render(
      <NumberRangeFilter minValue={undefined} maxValue={undefined} onRangeChange={onRangeChange} />,
    )

    typeMin("5")
    typeMax("10")
    advance(100)
    unmount()

    expect(onRangeChange).toHaveBeenCalledTimes(1)
    expect(onRangeChange).toHaveBeenCalledWith(5, 10)
  })

  it("keeps an already-committed min when max is typed afterwards", () => {
    const onRangeChange = vi.fn()
    render(<ControlledRange onRangeChange={onRangeChange} />)

    typeMin("5")
    advance(400)
    typeMax("10")
    advance(400)

    expect(onRangeChange).toHaveBeenLastCalledWith(5, 10)
  })

  it("does not report again on unmount once the debounce already fired", () => {
    const onRangeChange = vi.fn()
    const { unmount } = render(
      <NumberRangeFilter minValue={undefined} maxValue={undefined} onRangeChange={onRangeChange} />,
    )

    typeMin("5")
    advance(400)
    unmount()

    expect(onRangeChange).toHaveBeenCalledTimes(1)
  })

  it("reports nothing on unmount when the user never typed", () => {
    const onRangeChange = vi.fn()
    const { unmount } = render(<NumberRangeFilter minValue={5} maxValue={10} onRangeChange={onRangeChange} />)

    unmount()

    expect(onRangeChange).not.toHaveBeenCalled()
  })

  it("clears both bounds from the clear button", () => {
    const onRangeChange = vi.fn()
    render(<NumberRangeFilter minValue={5} maxValue={10} onRangeChange={onRangeChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }))
    advance(400)

    expect(onRangeChange).toHaveBeenCalledWith(undefined, undefined)
  })
})
