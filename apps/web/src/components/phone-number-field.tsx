import { FormField, Input, Select, type SelectOption, Text, useMountEffect } from "@repo/ui"
import { ChevronDown } from "lucide-react"
import {
  callingCodeForIso2,
  detectCallingCode,
  isKnownCallingCode,
  PHONE_COUNTRIES,
  phoneCountryFlag,
  phoneCountrySearchText,
  splitInternationalPhoneNumber,
  trunkPrefixHint,
} from "../lib/phone-countries.ts"

// Rows are keyed by ISO code because ~50 countries share a calling code and the Select keys by value.
const COUNTRY_OPTIONS: SelectOption<string>[] = PHONE_COUNTRIES.map((country) => ({
  label: `${country.name} +${country.dialCode}`,
  value: country.iso2,
  searchText: phoneCountrySearchText(country),
  icon: <span aria-hidden>{phoneCountryFlag(country.iso2)}</span>,
}))

export function PhoneNumberField({
  label,
  description,
  callingCode,
  nationalNumber,
  errors,
  onCallingCodeChange,
  onNationalNumberChange,
}: {
  readonly label: string
  readonly description?: string
  readonly callingCode: string
  readonly nationalNumber: string
  readonly errors?: string[] | undefined
  readonly onCallingCodeChange: (callingCode: string) => void
  readonly onNationalNumberChange: (nationalNumber: string) => void
}) {
  // Detection is client-only, so it runs after mount rather than seeding the form's default value.
  useMountEffect(() => {
    if (callingCode) return
    const detected = detectCallingCode()
    if (detected) onCallingCodeChange(detected)
  })

  const handleNationalNumberChange = (raw: string) => {
    if (raw.trimStart().startsWith("+")) {
      const parsed = splitInternationalPhoneNumber(raw)
      if (parsed) {
        onCallingCodeChange(parsed.callingCode)
        onNationalNumberChange(parsed.nationalNumber)
        return
      }
    }
    onNationalNumberChange(raw.replace(/[^\d\s().-]/g, ""))
  }

  const hint = trunkPrefixHint(callingCode, nationalNumber)

  return (
    <FormField label={label} description={hint ?? description} errors={errors}>
      <div className="flex items-center gap-2">
        <Select
          name="phoneCallingCode"
          width="auto"
          side="bottom"
          searchable
          searchPlaceholder="Search country or code"
          searchableEmptyMessage="No country found."
          options={COUNTRY_OPTIONS}
          onChange={(iso2) => {
            const code = callingCodeForIso2(iso2)
            if (code) onCallingCodeChange(code)
          }}
          contentClassName="min-w-72"
          trigger={
            <button
              type="button"
              aria-label={isKnownCallingCode(callingCode) ? `Calling code: +${callingCode}` : "Calling code"}
              className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-transparent px-3 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Text.H5 noWrap>{isKnownCallingCode(callingCode) ? `+${callingCode}` : "Code"}</Text.H5>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </button>
          }
        />
        <Input
          type="tel"
          className="flex-1"
          placeholder="Phone number"
          value={nationalNumber}
          onChange={(event) => handleNationalNumberChange(event.target.value)}
          maxLength={24}
          autoComplete="tel-national"
          inputMode="tel"
        />
      </div>
    </FormField>
  )
}
