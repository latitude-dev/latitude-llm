import type { ProviderErrorClassification } from "../entities/span-endpoint.ts"

const RATE_LIMIT_ERROR_TYPES = new Set([
  "quota_exceeded",
  "rate_limit_error",
  "rate_limit_exceeded",
  "resource_exhausted",
  "throttled",
  "throttling_exception",
  "too_many_requests",
])
const OVERLOAD_ERROR_TYPES = new Set(["model_overloaded", "overloaded_error", "server_overloaded"])
const SERVICE_FAILURE_ERROR_TYPES = new Set([
  "api_connection_error",
  "api_timeout_error",
  "bad_gateway",
  "gateway_timeout",
  "internal_server_error",
  "server_error",
  "service_unavailable",
  "timeout_error",
])
const PROVIDER_REJECTION_ERROR_TYPES = new Set([
  "authentication_error",
  "bad_request_error",
  "forbidden",
  "invalid_request_error",
  "not_found_error",
  "permission_denied",
  "permission_denied_error",
  "provider_rejection",
  "request_rejected",
  "request_too_large",
  "unauthorized",
  "unprocessable_entity_error",
])

const isUppercaseAscii = (character: string | undefined): boolean =>
  character !== undefined && character >= "A" && character <= "Z"

const isLowercaseAscii = (character: string | undefined): boolean =>
  character !== undefined && character >= "a" && character <= "z"

const isDigitAscii = (character: string | undefined): boolean =>
  character !== undefined && character >= "0" && character <= "9"

const startsUppercaseWord = (previousCharacter: string | undefined, nextCharacter: string | undefined): boolean =>
  isLowercaseAscii(previousCharacter) ||
  isDigitAscii(previousCharacter) ||
  (isUppercaseAscii(previousCharacter) && isLowercaseAscii(nextCharacter))

const appendSeparator = (value: string): string => (value && !value.endsWith("_") ? `${value}_` : value)

export const normalizeProviderErrorType = (rawValue: string): string => {
  let normalizedValue = ""

  for (let index = 0; index < rawValue.length; index += 1) {
    const character = rawValue[index]
    const previousCharacter = rawValue[index - 1]
    const nextCharacter = rawValue[index + 1]

    if (isUppercaseAscii(character)) {
      if (startsUppercaseWord(previousCharacter, nextCharacter)) {
        normalizedValue = appendSeparator(normalizedValue)
      }
      normalizedValue += character.toLowerCase()
      continue
    }

    if (isLowercaseAscii(character) || isDigitAscii(character)) {
      normalizedValue += character
      continue
    }

    normalizedValue = appendSeparator(normalizedValue)
  }

  return normalizedValue.endsWith("_") ? normalizedValue.slice(0, -1) : normalizedValue
}

const matchesErrorType = (normalizedValue: string, knownValues: ReadonlySet<string>): boolean => {
  if (knownValues.has(normalizedValue)) return true
  for (const knownValue of knownValues) {
    if (normalizedValue.endsWith(`_${knownValue}`)) return true
  }
  return false
}

export const classifyProviderError = (rawValue: string): ProviderErrorClassification | null => {
  const normalizedValue = normalizeProviderErrorType(rawValue)
  if (!normalizedValue) return null

  const base = { rawValue, normalizedValue }
  if (matchesErrorType(normalizedValue, RATE_LIMIT_ERROR_TYPES)) {
    return { ...base, classification: "providerError", kind: "rateLimit" }
  }
  if (matchesErrorType(normalizedValue, OVERLOAD_ERROR_TYPES)) {
    return { ...base, classification: "providerError", kind: "overload" }
  }
  if (matchesErrorType(normalizedValue, SERVICE_FAILURE_ERROR_TYPES)) {
    return { ...base, classification: "providerError", kind: "serviceFailure" }
  }
  if (matchesErrorType(normalizedValue, PROVIDER_REJECTION_ERROR_TYPES)) {
    return { ...base, classification: "providerError", kind: "providerRejection" }
  }

  return { ...base, classification: "unmapped" }
}
