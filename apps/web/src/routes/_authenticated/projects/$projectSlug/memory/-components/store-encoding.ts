// Sentinels start with `~`; escaping any real id that already starts with `~`
// keeps a real `~unattributed` / `~unnamed` id from colliding with a sentinel
// across a round-trip.
const escapeSentinel = (value: string): string => (value.startsWith("~") ? `~${value}` : value)
const unescapeSentinel = (value: string): string => (value.startsWith("~") ? value.slice(1) : value)

const UNATTRIBUTED_STORE_SEGMENT = "~unattributed"

/** Store ids are opaque (may contain `/`), so keep them in one encoded path segment. */
export const encodeStoreSegment = (storeId: string): string =>
  storeId === "" ? UNATTRIBUTED_STORE_SEGMENT : encodeURIComponent(escapeSentinel(storeId))

export const decodeStoreSegment = (segment: string): string =>
  segment === UNATTRIBUTED_STORE_SEGMENT ? "" : unescapeSentinel(decodeURIComponent(segment))

export const storeDisplayLabel = (storeId: string): string => (storeId === "" ? "(unattributed)" : storeId)

// The `?record=` param is empty when nothing is selected, so the unnamed record
// (id `''`) needs a sentinel to be distinguishable from "no selection".
const UNNAMED_RECORD_PARAM = "~unnamed"

export const encodeRecordParam = (recordId: string): string =>
  recordId === "" ? UNNAMED_RECORD_PARAM : escapeSentinel(recordId)

export const decodeRecordParam = (param: string): string =>
  param === UNNAMED_RECORD_PARAM ? "" : unescapeSentinel(param)

export const recordDisplayLabel = (recordId: string): string => (recordId === "" ? "(unnamed)" : recordId)
