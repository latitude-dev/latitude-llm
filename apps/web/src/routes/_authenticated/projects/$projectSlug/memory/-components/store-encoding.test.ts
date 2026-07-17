import { describe, expect, it } from "vitest"
import { decodeRecordParam, decodeStoreSegment, encodeRecordParam, encodeStoreSegment } from "./store-encoding.ts"

describe("store segment encoding", () => {
  it("round-trips ordinary and empty store ids", () => {
    for (const storeId of ["", "user-42", "team/shared", "a b", "%7E"]) {
      expect(decodeStoreSegment(encodeStoreSegment(storeId))).toBe(storeId)
    }
  })

  it("keeps a real store id that matches the unattributed sentinel distinct from empty", () => {
    for (const storeId of ["~unattributed", "~foo", "~"]) {
      expect(encodeStoreSegment(storeId)).not.toBe(encodeStoreSegment(""))
      expect(decodeStoreSegment(encodeStoreSegment(storeId))).toBe(storeId)
    }
    expect(decodeStoreSegment(encodeStoreSegment(""))).toBe("")
  })
})

describe("record param encoding", () => {
  it("round-trips ordinary and empty record ids", () => {
    for (const recordId of ["", "prefs/theme", "note-1", "~unnamed", "~", "~foo"]) {
      expect(decodeRecordParam(encodeRecordParam(recordId))).toBe(recordId)
    }
  })

  it("keeps a real record id that matches the unnamed sentinel distinct from empty", () => {
    expect(encodeRecordParam("~unnamed")).not.toBe(encodeRecordParam(""))
    expect(decodeRecordParam(encodeRecordParam("~unnamed"))).toBe("~unnamed")
    expect(decodeRecordParam(encodeRecordParam(""))).toBe("")
  })
})
