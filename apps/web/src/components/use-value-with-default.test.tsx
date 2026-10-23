// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useValueWithDefault } from "../../../../packages/ui/src/hooks/use-value-with-default.ts"

afterEach(cleanup)

describe("useValueWithDefault", () => {
  it("stores an explicit null override", () => {
    const { result } = renderHook(() => useValueWithDefault<string | null>("server"))
    act(() => result.current[1](null))
    expect(result.current[0]).toBeNull()
  })
  it("stores an explicit undefined override", () => {
    const { result } = renderHook(() => useValueWithDefault<string | undefined>("server"))
    act(() => result.current[1](undefined))
    expect(result.current[0]).toBeUndefined()
  })
  it("resets an override when the default changes", () => {
    const { result, rerender } = renderHook(({ value }: { value: string | null }) => useValueWithDefault(value), {
      initialProps: { value: "server" as string | null },
    })
    act(() => result.current[1](null))
    rerender({ value: "refetched" })
    expect(result.current[0]).toBe("refetched")
    act(() => result.current[1]("edited"))
    rerender({ value: null })
    expect(result.current[0]).toBeNull()
  })
  it("retains an override across an unchanged default", () => {
    const { result, rerender } = renderHook(() => useValueWithDefault<string | null>("server"))
    act(() => result.current[1](null))
    rerender()
    expect(result.current[0]).toBeNull()
  })
  it("retains falsy primitive overrides and the stable setter", () => {
    const { result } = renderHook(() => useValueWithDefault<string | number | boolean>("server"))
    const setter = result.current[1]
    for (const value of ["", 0, false]) {
      act(() => setter(value))
      expect(result.current[0]).toBe(value)
      expect(result.current[1]).toBe(setter)
    }
  })
})
