import { describe, expect, it } from "vitest"
import {
  ANNOTATOR_FILTER_FIELD,
  getHasAnnotationsOn,
  getInValues,
  getStatusValues,
  setAnnotatedBy,
  setHasAnnotations,
} from "./utils.ts"

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

describe("annotator filter conditions", () => {
  it("keeps the two controls independent on the shared field", () => {
    const scoredBy = setAnnotatedBy({}, ["u1", "u2"])
    const both = setHasAnnotations(scoredBy, true)

    expect(getInValues(both, ANNOTATOR_FILTER_FIELD)).toEqual(["u1", "u2"])
    expect(getHasAnnotationsOn(both)).toBe(true)

    const withoutToggle = setHasAnnotations(both, false)
    expect(getHasAnnotationsOn(withoutToggle)).toBe(false)
    expect(getInValues(withoutToggle, ANNOTATOR_FILTER_FIELD)).toEqual(["u1", "u2"])

    const withoutPeople = setAnnotatedBy(both, [])
    expect(getInValues(withoutPeople, ANNOTATOR_FILTER_FIELD)).toEqual([])
    expect(getHasAnnotationsOn(withoutPeople)).toBe(true)
  })

  it("drops the field entirely when nothing is left", () => {
    expect(setHasAnnotations(setAnnotatedBy({}, ["u1"]), false)).toEqual({
      [ANNOTATOR_FILTER_FIELD]: [{ op: "in", value: ["u1"] }],
    })
    expect(setAnnotatedBy(setAnnotatedBy({}, ["u1"]), [])).toEqual({})
  })

  it("replaces an eq annotator rather than AND-ing it with the new list", () => {
    const imported = { [ANNOTATOR_FILTER_FIELD]: [{ op: "eq" as const, value: "u1" }] }
    expect(setAnnotatedBy(imported, ["u1", "u2"])).toEqual({
      [ANNOTATOR_FILTER_FIELD]: [{ op: "in", value: ["u1", "u2"] }],
    })
  })
})
