type PhoneCountry = {
  readonly iso2: string
  readonly name: string
  readonly dialCode: string
}

// NANP territories all share dial code "1" — their area codes belong to the national number.
const ENTRIES: ReadonlyArray<readonly [iso2: string, dialCode: string, name: string]> = [
  ["AF", "93", "Afghanistan"],
  ["AX", "358", "Åland Islands"],
  ["AL", "355", "Albania"],
  ["DZ", "213", "Algeria"],
  ["AS", "1", "American Samoa"],
  ["AD", "376", "Andorra"],
  ["AO", "244", "Angola"],
  ["AI", "1", "Anguilla"],
  ["AG", "1", "Antigua & Barbuda"],
  ["AR", "54", "Argentina"],
  ["AM", "374", "Armenia"],
  ["AW", "297", "Aruba"],
  ["AU", "61", "Australia"],
  ["AT", "43", "Austria"],
  ["AZ", "994", "Azerbaijan"],
  ["BS", "1", "Bahamas"],
  ["BH", "973", "Bahrain"],
  ["BD", "880", "Bangladesh"],
  ["BB", "1", "Barbados"],
  ["BY", "375", "Belarus"],
  ["BE", "32", "Belgium"],
  ["BZ", "501", "Belize"],
  ["BJ", "229", "Benin"],
  ["BM", "1", "Bermuda"],
  ["BT", "975", "Bhutan"],
  ["BO", "591", "Bolivia"],
  ["BA", "387", "Bosnia & Herzegovina"],
  ["BW", "267", "Botswana"],
  ["BR", "55", "Brazil"],
  ["IO", "246", "British Indian Ocean Territory"],
  ["VG", "1", "British Virgin Islands"],
  ["BN", "673", "Brunei"],
  ["BG", "359", "Bulgaria"],
  ["BF", "226", "Burkina Faso"],
  ["BI", "257", "Burundi"],
  ["KH", "855", "Cambodia"],
  ["CM", "237", "Cameroon"],
  ["CA", "1", "Canada"],
  ["CV", "238", "Cape Verde"],
  ["BQ", "599", "Caribbean Netherlands"],
  ["KY", "1", "Cayman Islands"],
  ["CF", "236", "Central African Republic"],
  ["TD", "235", "Chad"],
  ["CL", "56", "Chile"],
  ["CN", "86", "China"],
  ["CX", "61", "Christmas Island"],
  ["CC", "61", "Cocos (Keeling) Islands"],
  ["CO", "57", "Colombia"],
  ["KM", "269", "Comoros"],
  ["CG", "242", "Congo - Brazzaville"],
  ["CD", "243", "Congo - Kinshasa"],
  ["CK", "682", "Cook Islands"],
  ["CR", "506", "Costa Rica"],
  ["CI", "225", "Côte d'Ivoire"],
  ["HR", "385", "Croatia"],
  ["CU", "53", "Cuba"],
  ["CW", "599", "Curaçao"],
  ["CY", "357", "Cyprus"],
  ["CZ", "420", "Czechia"],
  ["DK", "45", "Denmark"],
  ["DJ", "253", "Djibouti"],
  ["DM", "1", "Dominica"],
  ["DO", "1", "Dominican Republic"],
  ["EC", "593", "Ecuador"],
  ["EG", "20", "Egypt"],
  ["SV", "503", "El Salvador"],
  ["GQ", "240", "Equatorial Guinea"],
  ["ER", "291", "Eritrea"],
  ["EE", "372", "Estonia"],
  ["SZ", "268", "Eswatini"],
  ["ET", "251", "Ethiopia"],
  ["FK", "500", "Falkland Islands"],
  ["FO", "298", "Faroe Islands"],
  ["FJ", "679", "Fiji"],
  ["FI", "358", "Finland"],
  ["FR", "33", "France"],
  ["GF", "594", "French Guiana"],
  ["PF", "689", "French Polynesia"],
  ["GA", "241", "Gabon"],
  ["GM", "220", "Gambia"],
  ["GE", "995", "Georgia"],
  ["DE", "49", "Germany"],
  ["GH", "233", "Ghana"],
  ["GI", "350", "Gibraltar"],
  ["GR", "30", "Greece"],
  ["GL", "299", "Greenland"],
  ["GD", "1", "Grenada"],
  ["GP", "590", "Guadeloupe"],
  ["GU", "1", "Guam"],
  ["GT", "502", "Guatemala"],
  ["GG", "44", "Guernsey"],
  ["GN", "224", "Guinea"],
  ["GW", "245", "Guinea-Bissau"],
  ["GY", "592", "Guyana"],
  ["HT", "509", "Haiti"],
  ["HN", "504", "Honduras"],
  ["HK", "852", "Hong Kong SAR China"],
  ["HU", "36", "Hungary"],
  ["IS", "354", "Iceland"],
  ["IN", "91", "India"],
  ["ID", "62", "Indonesia"],
  ["IR", "98", "Iran"],
  ["IQ", "964", "Iraq"],
  ["IE", "353", "Ireland"],
  ["IM", "44", "Isle of Man"],
  ["IL", "972", "Israel"],
  ["IT", "39", "Italy"],
  ["JM", "1", "Jamaica"],
  ["JP", "81", "Japan"],
  ["JE", "44", "Jersey"],
  ["JO", "962", "Jordan"],
  ["KZ", "7", "Kazakhstan"],
  ["KE", "254", "Kenya"],
  ["KI", "686", "Kiribati"],
  ["XK", "383", "Kosovo"],
  ["KW", "965", "Kuwait"],
  ["KG", "996", "Kyrgyzstan"],
  ["LA", "856", "Laos"],
  ["LV", "371", "Latvia"],
  ["LB", "961", "Lebanon"],
  ["LS", "266", "Lesotho"],
  ["LR", "231", "Liberia"],
  ["LY", "218", "Libya"],
  ["LI", "423", "Liechtenstein"],
  ["LT", "370", "Lithuania"],
  ["LU", "352", "Luxembourg"],
  ["MO", "853", "Macao SAR China"],
  ["MG", "261", "Madagascar"],
  ["MW", "265", "Malawi"],
  ["MY", "60", "Malaysia"],
  ["MV", "960", "Maldives"],
  ["ML", "223", "Mali"],
  ["MT", "356", "Malta"],
  ["MH", "692", "Marshall Islands"],
  ["MQ", "596", "Martinique"],
  ["MR", "222", "Mauritania"],
  ["MU", "230", "Mauritius"],
  ["YT", "262", "Mayotte"],
  ["MX", "52", "Mexico"],
  ["FM", "691", "Micronesia"],
  ["MD", "373", "Moldova"],
  ["MC", "377", "Monaco"],
  ["MN", "976", "Mongolia"],
  ["ME", "382", "Montenegro"],
  ["MS", "1", "Montserrat"],
  ["MA", "212", "Morocco"],
  ["MZ", "258", "Mozambique"],
  ["MM", "95", "Myanmar (Burma)"],
  ["NA", "264", "Namibia"],
  ["NR", "674", "Nauru"],
  ["NP", "977", "Nepal"],
  ["NL", "31", "Netherlands"],
  ["NC", "687", "New Caledonia"],
  ["NZ", "64", "New Zealand"],
  ["NI", "505", "Nicaragua"],
  ["NE", "227", "Niger"],
  ["NG", "234", "Nigeria"],
  ["NU", "683", "Niue"],
  ["NF", "672", "Norfolk Island"],
  ["KP", "850", "North Korea"],
  ["MK", "389", "North Macedonia"],
  ["MP", "1", "Northern Mariana Islands"],
  ["NO", "47", "Norway"],
  ["OM", "968", "Oman"],
  ["PK", "92", "Pakistan"],
  ["PW", "680", "Palau"],
  ["PS", "970", "Palestinian Territories"],
  ["PA", "507", "Panama"],
  ["PG", "675", "Papua New Guinea"],
  ["PY", "595", "Paraguay"],
  ["PE", "51", "Peru"],
  ["PH", "63", "Philippines"],
  ["PL", "48", "Poland"],
  ["PT", "351", "Portugal"],
  ["PR", "1", "Puerto Rico"],
  ["QA", "974", "Qatar"],
  ["RE", "262", "Réunion"],
  ["RO", "40", "Romania"],
  ["RU", "7", "Russia"],
  ["RW", "250", "Rwanda"],
  ["WS", "685", "Samoa"],
  ["SM", "378", "San Marino"],
  ["ST", "239", "São Tomé & Príncipe"],
  ["SA", "966", "Saudi Arabia"],
  ["SN", "221", "Senegal"],
  ["RS", "381", "Serbia"],
  ["SC", "248", "Seychelles"],
  ["SL", "232", "Sierra Leone"],
  ["SG", "65", "Singapore"],
  ["SX", "1", "Sint Maarten"],
  ["SK", "421", "Slovakia"],
  ["SI", "386", "Slovenia"],
  ["SB", "677", "Solomon Islands"],
  ["SO", "252", "Somalia"],
  ["ZA", "27", "South Africa"],
  ["KR", "82", "South Korea"],
  ["SS", "211", "South Sudan"],
  ["ES", "34", "Spain"],
  ["LK", "94", "Sri Lanka"],
  ["BL", "590", "St. Barthélemy"],
  ["SH", "290", "St. Helena"],
  ["KN", "1", "St. Kitts & Nevis"],
  ["LC", "1", "St. Lucia"],
  ["MF", "590", "St. Martin"],
  ["PM", "508", "St. Pierre & Miquelon"],
  ["VC", "1", "St. Vincent & Grenadines"],
  ["SD", "249", "Sudan"],
  ["SR", "597", "Suriname"],
  ["SJ", "47", "Svalbard & Jan Mayen"],
  ["SE", "46", "Sweden"],
  ["CH", "41", "Switzerland"],
  ["SY", "963", "Syria"],
  ["TW", "886", "Taiwan"],
  ["TJ", "992", "Tajikistan"],
  ["TZ", "255", "Tanzania"],
  ["TH", "66", "Thailand"],
  ["TL", "670", "Timor-Leste"],
  ["TG", "228", "Togo"],
  ["TK", "690", "Tokelau"],
  ["TO", "676", "Tonga"],
  ["TT", "1", "Trinidad & Tobago"],
  ["TN", "216", "Tunisia"],
  ["TR", "90", "Türkiye"],
  ["TM", "993", "Turkmenistan"],
  ["TC", "1", "Turks & Caicos Islands"],
  ["TV", "688", "Tuvalu"],
  ["UG", "256", "Uganda"],
  ["UA", "380", "Ukraine"],
  ["AE", "971", "United Arab Emirates"],
  ["GB", "44", "United Kingdom"],
  ["US", "1", "United States"],
  ["UY", "598", "Uruguay"],
  ["UZ", "998", "Uzbekistan"],
  ["VU", "678", "Vanuatu"],
  ["VA", "39", "Vatican City"],
  ["VE", "58", "Venezuela"],
  ["VN", "84", "Vietnam"],
  ["WF", "681", "Wallis & Futuna"],
  ["EH", "212", "Western Sahara"],
  ["YE", "967", "Yemen"],
  ["ZM", "260", "Zambia"],
  ["ZW", "263", "Zimbabwe"],
]

export const PHONE_COUNTRIES: ReadonlyArray<PhoneCountry> = ENTRIES.map(([iso2, dialCode, name]) => ({
  iso2,
  name,
  dialCode,
}))

const CALLING_CODE_BY_ISO2 = new Map(PHONE_COUNTRIES.map(({ iso2, dialCode }) => [iso2, dialCode]))

const KNOWN_CALLING_CODES = new Set(PHONE_COUNTRIES.map(({ dialCode }) => dialCode))

const MAX_CALLING_CODE_LENGTH = Math.max(...[...KNOWN_CALLING_CODES].map((code) => code.length))

// Names people search by that no country's official name contains.
const SEARCH_ALIASES: Readonly<Record<string, string>> = {
  GB: "UK Great Britain England Scotland Wales",
  US: "USA America",
  AE: "UAE",
  NL: "Holland",
  CZ: "Czech Republic",
  TR: "Turkey",
  CI: "Ivory Coast",
  SZ: "Swaziland",
  MK: "Macedonia",
  RU: "Russian Federation",
  KR: "Korea",
  KP: "Korea",
  VN: "Viet Nam",
  LA: "Lao",
  TL: "East Timor",
}

const MIN_NATIONAL_NUMBER_DIGITS = 4
const MAX_E164_DIGITS = 15

// Trunk digit dropped when writing a number internationally, where it differs from the usual "0".
const TRUNK_PREFIX_BY_CALLING_CODE: Readonly<Record<string, string>> = { "7": "8" }

// +39 covers Italy and Vatican City, where a leading 0 is part of the landline number rather than a trunk digit.
const CALLING_CODES_WITH_SIGNIFICANT_LEADING_ZERO = new Set(["39"])

export function callingCodeForIso2(iso2: string): string | undefined {
  return CALLING_CODE_BY_ISO2.get(iso2.toUpperCase())
}

export function isKnownCallingCode(callingCode: string): boolean {
  return KNOWN_CALLING_CODES.has(callingCode)
}

export function phoneCountrySearchText({ iso2, name, dialCode }: PhoneCountry): string {
  return `${name} ${iso2} +${dialCode} ${SEARCH_ALIASES[iso2] ?? ""}`.trimEnd()
}

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - "A".charCodeAt(0)

export function phoneCountryFlag(iso2: string): string {
  const codePoints = [...iso2.toUpperCase()].map((letter) => letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET)
  return String.fromCodePoint(...codePoints)
}

function nationalNumberDigits(value: string): string {
  return value.replace(/\D/g, "")
}

export function composePhoneNumber(callingCode: string, nationalNumber: string): string {
  const digits = nationalNumberDigits(nationalNumber)
  if (digits.length === 0) return ""
  // Bare digits rather than "" so a bypassed client surfaces the server's error instead of dropping the number.
  if (!isKnownCallingCode(callingCode) || nationalNumber.includes("+")) return digits
  return `+${callingCode}${digits}`
}

/** Whether a composed value is storable: a known calling code followed by a national number. */
export function isStorablePhoneNumber(value: string): boolean {
  if (!/^\+[1-9]\d{4,14}$/.test(value)) return false
  const parsed = splitInternationalPhoneNumber(value)
  return parsed !== undefined && parsed.nationalNumber.length >= MIN_NATIONAL_NUMBER_DIGITS
}

function couldStillBecomeCallingCode(digits: string): boolean {
  for (const code of KNOWN_CALLING_CODES) if (code.startsWith(digits)) return true
  return false
}

export function phoneNumberError(nationalNumber: string, callingCode: string): string | undefined {
  const digits = nationalNumberDigits(nationalNumber)
  if (digits.length === 0) return undefined
  if (nationalNumber.includes("+")) {
    return couldStillBecomeCallingCode(digits) ? undefined : "That international prefix isn't recognised"
  }
  if (!isKnownCallingCode(callingCode)) return "Select your calling code"
  if (digits.length < MIN_NATIONAL_NUMBER_DIGITS) return "Enter a valid phone number"
  if (callingCode.length + digits.length > MAX_E164_DIGITS) return "Enter a valid phone number"
  return undefined
}

/** Stricter than the on-change check, which tolerates a prefix the next keystroke could complete. */
export function phoneNumberSubmitError(nationalNumber: string, callingCode: string): string | undefined {
  if (nationalNumberDigits(nationalNumber).length > 0 && nationalNumber.includes("+")) {
    return "That international prefix isn't recognised"
  }
  return phoneNumberError(nationalNumber, callingCode)
}

/** Keeps a still-unparseable international prefix intact so further keystrokes can complete it. */
export function sanitizeNationalNumberInput(raw: string): string {
  const trimmed = raw.trimStart()
  const body = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed
  const cleaned = body.replace(/[^\d\s().-]/g, "")
  return trimmed.startsWith("+") ? `+${cleaned}` : cleaned
}

/** Advisory only: auto-stripping would corrupt Italian landlines, where the leading 0 is significant. */
export function trunkPrefixHint(callingCode: string, nationalNumber: string): string | undefined {
  const digits = nationalNumberDigits(nationalNumber)
  if (digits.length < 2 || !isKnownCallingCode(callingCode)) return undefined
  if (CALLING_CODES_WITH_SIGNIFICANT_LEADING_ZERO.has(callingCode)) return undefined
  const trunk = TRUNK_PREFIX_BY_CALLING_CODE[callingCode] ?? "0"
  if (!digits.startsWith(trunk)) return undefined
  return `Numbers are usually written without the leading ${trunk} internationally. This saves as +${callingCode}${digits}.`
}

/** Splits a pasted international number so the picker follows the "+" prefix the user typed. */
export function splitInternationalPhoneNumber(
  value: string,
): { readonly callingCode: string; readonly nationalNumber: string } | undefined {
  const digits = nationalNumberDigits(value)
  if (digits.length === 0) return undefined
  for (let length = Math.min(MAX_CALLING_CODE_LENGTH, digits.length); length > 0; length--) {
    const callingCode = digits.slice(0, length)
    if (KNOWN_CALLING_CODES.has(callingCode)) return { callingCode, nationalNumber: digits.slice(length) }
  }
  return undefined
}

type LocaleWithTimeZones = Intl.Locale & { getTimeZones?: () => string[] | undefined }

/** Canonicalising through `resolvedOptions` makes legacy zone aliases match ICU's own region lists. */
export function callingCodeForTimeZone(timeZone: string): string | undefined {
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone
    for (const { iso2, dialCode } of PHONE_COUNTRIES) {
      const zones = (new Intl.Locale(`und-${iso2}`) as LocaleWithTimeZones).getTimeZones?.()
      if (zones?.includes(canonical)) return dialCode
    }
  } catch {
    return undefined
  }
  return undefined
}

/** Best-effort guess from the browser's timezone; users can always override it in the picker. */
export function detectCallingCode(): string | undefined {
  try {
    if (typeof (new Intl.Locale("und-ES") as LocaleWithTimeZones).getTimeZones !== "function") return undefined
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!timeZone) return undefined
    return callingCodeForTimeZone(timeZone)
  } catch {
    return undefined
  }
}
