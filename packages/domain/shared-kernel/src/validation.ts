/**
 * Validation utilities for domain types.
 *
 * These functions provide runtime validation for common value objects.
 */

// Email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type Email = string & { readonly __brand: "Email" }

export const Email = (value: string): Email => {
  if (!EMAIL_REGEX.test(value)) {
    throw new Error(`Invalid email: ${value}`)
  }
  return value as Email
}

export const isValidEmail = (value: string): boolean => EMAIL_REGEX.test(value)

// Non-empty string validation
export const nonEmptyString = (value: string, fieldName: string): string => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`)
  }
  return value.trim()
}

// Length validation
export const maxLength = (value: string, max: number, fieldName: string): string => {
  if (value.length > max) {
    throw new Error(`${fieldName} exceeds maximum length of ${max}`)
  }
  return value
}

// UUID validation (simplified)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isValidUUID = (value: string): boolean => UUID_REGEX.test(value)

// Timestamp type (ISO 8601 string)
export type Timestamp = string & { readonly __brand: "Timestamp" }

export const Timestamp = (value: string | Date): Timestamp => {
  if (value instanceof Date) {
    return value.toISOString() as Timestamp
  }
  // Validate it's a valid ISO string
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${value}`)
  }
  return value as Timestamp
}

// Money/cents type (integer cents to avoid floating point issues)
export type Money = number & { readonly __brand: "Money" }

export const Money = (cents: number): Money => {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("Money must be a non-negative integer (cents)")
  }
  return cents as Money
}

// Positive integer validation
export const positiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }
  return value
}

// Non-negative integer validation
export const nonNegativeInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }
  return value
}
