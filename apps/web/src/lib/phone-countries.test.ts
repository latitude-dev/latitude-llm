import { describe, expect, it } from "vitest"
import {
  callingCodeForIso2,
  callingCodeForTimeZone,
  composePhoneNumber,
  isStorablePhoneNumber,
  PHONE_COUNTRIES,
  phoneCountryFlag,
  phoneCountrySearchText,
  phoneNumberError,
  sanitizeNationalNumberInput,
  splitInternationalPhoneNumber,
  trunkPrefixHint,
} from "./phone-countries.ts"

describe("PHONE_COUNTRIES", () => {
  it("has unique ISO 3166-1 alpha-2 codes", () => {
    const iso2Codes = PHONE_COUNTRIES.map((country) => country.iso2)
    expect(new Set(iso2Codes).size).toBe(iso2Codes.length)
  })

  it("stores calling codes as bare digits without a leading plus or zero", () => {
    for (const { iso2, dialCode } of PHONE_COUNTRIES) {
      expect(dialCode, iso2).toMatch(/^[1-9]\d{0,2}$/)
    }
  })

  it("gives NANP territories the shared +1 code so area codes stay in the national number", () => {
    for (const iso2 of ["US", "CA", "DO", "PR", "JM"]) {
      expect(callingCodeForIso2(iso2), iso2).toBe("1")
    }
  })
})

describe("phoneCountrySearchText", () => {
  it("matches on names the official country name does not contain", () => {
    const gb = PHONE_COUNTRIES.find((c) => c.iso2 === "GB")
    expect(gb).toBeDefined()
    if (!gb) return
    const searchText = phoneCountrySearchText(gb).toLowerCase()
    expect(searchText).toContain("uk")
    expect(searchText).toContain("gb")
    expect(searchText).toContain("+44")
  })

  it("matches United States on the abbreviation its name lacks", () => {
    const us = PHONE_COUNTRIES.find((c) => c.iso2 === "US")
    expect(us).toBeDefined()
    if (!us) return
    expect("United States".toLowerCase()).not.toContain("us")
    expect(phoneCountrySearchText(us).toLowerCase()).toContain("us")
  })
})

describe("phoneCountryFlag", () => {
  it("maps an ISO code to regional indicator symbols", () => {
    expect(phoneCountryFlag("ES")).toBe("🇪🇸")
    expect(phoneCountryFlag("us")).toBe("🇺🇸")
  })
})

describe("composePhoneNumber", () => {
  it("prefixes the calling code and strips formatting characters", () => {
    expect(composePhoneNumber("34", "612 34 56 78")).toBe("+34612345678")
    expect(composePhoneNumber("1", "(555) 010-0123")).toBe("+15550100123")
  })

  it("returns an empty string only when there is no number at all", () => {
    expect(composePhoneNumber("34", "   ")).toBe("")
    expect(composePhoneNumber("", "")).toBe("")
  })

  it("returns bare digits for an unknown code so the server rejects instead of dropping the number", () => {
    expect(composePhoneNumber("", "612345678")).toBe("612345678")
    expect(composePhoneNumber("999", "612345678")).toBe("612345678")
    expect(isStorablePhoneNumber(composePhoneNumber("999", "612345678"))).toBe(false)
  })

  it("refuses to compose an unresolved international prefix into a plausible number", () => {
    expect(composePhoneNumber("34", "+4412")).toBe("4412")
  })

  it("keeps NANP area codes in the national number", () => {
    expect(composePhoneNumber("1", "809 234 5678")).toBe("+18092345678")
  })
})

describe("splitInternationalPhoneNumber", () => {
  it("matches the longest calling code", () => {
    expect(splitInternationalPhoneNumber("+34612345678")).toEqual({ callingCode: "34", nationalNumber: "612345678" })
    expect(splitInternationalPhoneNumber("+353 87 123 4567")).toEqual({
      callingCode: "353",
      nationalNumber: "871234567",
    })
  })

  it("resolves a shared calling code without guessing a country", () => {
    expect(splitInternationalPhoneNumber("+1 555 0100")).toEqual({ callingCode: "1", nationalNumber: "5550100" })
    expect(splitInternationalPhoneNumber("+44 7700 900000")).toEqual({
      callingCode: "44",
      nationalNumber: "7700900000",
    })
  })

  it("returns undefined when no calling code matches", () => {
    expect(splitInternationalPhoneNumber("+")).toBeUndefined()
    expect(splitInternationalPhoneNumber("+999999")).toBeUndefined()
  })
})

describe("phoneNumberError", () => {
  it("accepts an empty number because the field is optional", () => {
    expect(phoneNumberError("", "")).toBeUndefined()
    expect(phoneNumberError("  ", "34")).toBeUndefined()
  })

  it("requires a calling code once a number is typed", () => {
    expect(phoneNumberError("612345678", "")).toBe("Select your calling code")
  })

  it("flags a national number still holding an unresolved international prefix", () => {
    expect(phoneNumberError("+4412", "34")).toBe("That international prefix isn't recognised")
  })

  it("rejects numbers that are too short or exceed E.164 length", () => {
    expect(phoneNumberError("12", "34")).toBe("Enter a valid phone number")
    expect(phoneNumberError("6123456789012345", "34")).toBe("Enter a valid phone number")
  })

  it("accepts a well-formed national number", () => {
    expect(phoneNumberError("612 34 56 78", "34")).toBeUndefined()
  })
})

describe("trunkPrefixHint", () => {
  it("flags a leading zero and shows what would be stored", () => {
    const hint = trunkPrefixHint("44", "07700 900000")
    expect(hint).toContain("leading 0")
    expect(hint).toContain("+4407700900000")
  })

  it("flags a leading 8 on +7, where that is the trunk digit", () => {
    expect(trunkPrefixHint("7", "8 916 1234567")).toContain("leading 8")
    expect(trunkPrefixHint("7", "916 1234567")).toBeUndefined()
  })

  it("stays silent for Italy, where a leading zero is part of the number", () => {
    expect(trunkPrefixHint("39", "06 1234 5678")).toBeUndefined()
  })

  it("stays silent for a correctly written number", () => {
    expect(trunkPrefixHint("44", "7700 900000")).toBeUndefined()
    expect(trunkPrefixHint("34", "612 34 56 78")).toBeUndefined()
  })
})

describe("sanitizeNationalNumberInput", () => {
  it("keeps an incomplete international prefix so the next keystroke can complete it", () => {
    expect(sanitizeNationalNumberInput("+")).toBe("+")
    expect(sanitizeNationalNumberInput("+4")).toBe("+4")
  })

  it("strips characters that are never part of a phone number", () => {
    expect(sanitizeNationalNumberInput("612 34 abc 56-78")).toBe("612 34  56-78")
    expect(sanitizeNationalNumberInput("+4 abc 4")).toBe("+4  4")
  })

  it("keeps only a leading plus, not one typed mid-number", () => {
    expect(sanitizeNationalNumberInput("612+345")).toBe("612345")
  })
})

describe("isStorablePhoneNumber", () => {
  it("accepts a composed number whose prefix is a real calling code", () => {
    expect(isStorablePhoneNumber("+34612345678")).toBe(true)
    expect(isStorablePhoneNumber("+18092345678")).toBe(true)
    expect(isStorablePhoneNumber("+2904256")).toBe(true)
  })

  it("rejects an unassigned prefix that a digits-only pattern would allow", () => {
    expect(isStorablePhoneNumber("+99999999")).toBe(false)
    expect(isStorablePhoneNumber("+45678")).toBe(false)
  })

  it("rejects values with no calling code or the wrong shape", () => {
    expect(isStorablePhoneNumber("612345678")).toBe(false)
    expect(isStorablePhoneNumber("+0612345678")).toBe(false)
    expect(isStorablePhoneNumber("+34 612 345 678")).toBe(false)
    expect(isStorablePhoneNumber("+346123456789012345")).toBe(false)
  })
})

describe("callingCodeForTimeZone", () => {
  it("resolves location-bearing zones to their calling code", () => {
    expect(callingCodeForTimeZone("Europe/Madrid")).toBe("34")
    expect(callingCodeForTimeZone("America/New_York")).toBe("1")
    expect(callingCodeForTimeZone("America/Santo_Domingo")).toBe("1")
    expect(callingCodeForTimeZone("Asia/Tokyo")).toBe("81")
  })

  it("survives renamed IANA zones by canonicalising through ICU", () => {
    expect(callingCodeForTimeZone("Asia/Kolkata")).toBe("91")
    expect(callingCodeForTimeZone("Asia/Calcutta")).toBe("91")
    expect(callingCodeForTimeZone("Europe/Kyiv")).toBe("380")
  })

  it("returns undefined for an unknown zone", () => {
    expect(callingCodeForTimeZone("Pacific/Nowhere")).toBeUndefined()
  })
})
