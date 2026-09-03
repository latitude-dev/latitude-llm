import { describe, expect, it } from "vitest"
import { getInValues, getStatusValues } from "./utils.ts"

describe("getInValues", () => {
  it("reads the values the controls write", () => {
    expect(getInValues({ userId: [{ op: "in", value: ["u1", "u2"] }] }, "userId")).toEqual(["u1", "u2"])
  })

  // Monitor targets and API-created saved searches spell one value as `eq`; the sidebar has to
  // show it, or the results look filtered by something the panel claims is unset.
  it("reads a single value written as eq", () => {
    expect(getInValues({ userId: [{ op: "eq", value: "u1" }] }, "userId")).toEqual(["u1"])
  })

  it("prefers in over eq when both are present", () => {
    expect(
      getInValues(
        {
          userId: [
            { op: "eq", value: "u1" },
            { op: "in", value: ["u2"] },
          ],
        },
        "userId",
      ),
    ).toEqual(["u2"])
  })

  it("ignores operators it cannot render", () => {
    expect(getInValues({ userId: [{ op: "contains", value: "u" }] }, "userId")).toEqual([])
    expect(getInValues({}, "userId")).toEqual([])
  })
})

describe("getStatusValues", () => {
  it("keeps only known status values, from either operator", () => {
    expect(getStatusValues({ status: [{ op: "in", value: ["error", "nope"] }] }, "status")).toEqual(["error"])
    expect(getStatusValues({ status: [{ op: "eq", value: "ok" }] }, "status")).toEqual(["ok"])
  })
})
