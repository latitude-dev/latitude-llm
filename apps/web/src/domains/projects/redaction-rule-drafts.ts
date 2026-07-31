import {
  generateId,
  REDACTION_RULE_LABEL_PATTERN,
  RESERVED_REDACTION_LABELS,
  type RedactionRule,
  type RedactionRuleKind,
  redactionRuleSchema,
} from "@domain/shared"
import { z } from "zod"

interface RedactionRuleKindMeta {
  readonly label: string
  readonly description: string
}

export const REDACTION_RULE_KIND_META: Record<RedactionRuleKind, RedactionRuleKindMeta> = {
  attribute_key: {
    label: "Attribute key",
    description:
      "Removes a span attribute by name, wherever it appears. Nothing is scanned, so this cannot redact the wrong value.",
  },
  terms: {
    label: "Exact terms",
    description:
      "Removes a list of exact strings, such as known account numbers or internal names. Matches only what you list.",
  },
  pattern: {
    label: "Pattern",
    description:
      "Removes anything matching a regular expression. The most powerful option and the only one that can match values you did not intend.",
  },
}

/** Display order runs from the safest kind to the one that needs the most care. */
export const REDACTION_RULE_KIND_ORDER: readonly RedactionRuleKind[] = ["attribute_key", "terms", "pattern"]

/**
 * A rule list encoded for the page's draft overlay.
 *
 * The overlay compares fields with `Object.is` and rebuilds its baseline on every render, so an
 * array could never compare equal to its baseline and the form would read as permanently dirty.
 * Encoding to a string makes it a primitive, which is the same reason `encodeEntities` exists.
 *
 * The key order is fixed per kind rather than left to whatever order an object happens to carry,
 * so editing a rule and undoing the edit produces the identical string and the field drops back
 * out of the dirty set.
 */
export const encodeRules = (rules: readonly RedactionRule[]): string => JSON.stringify(rules.map(canonicalRule))

const canonicalRule = (rule: RedactionRule): Record<string, unknown> => {
  const head = { id: rule.id, kind: rule.kind, label: rule.label, enabled: rule.enabled }

  if (rule.kind === "attribute_key") return { ...head, keys: [...rule.keys] }
  if (rule.kind === "terms") {
    return { ...head, terms: [...rule.terms], wholeWord: rule.wholeWord, caseSensitive: rule.caseSensitive }
  }

  return {
    ...head,
    pattern: rule.pattern,
    ignoreCase: rule.ignoreCase,
    dotAll: rule.dotAll,
    validatorVersion: rule.validatorVersion,
  }
}

const encodedRulesSchema = z.array(redactionRuleSchema)

/**
 * Throws rather than falling back to an empty list. An empty list is a valid policy that deletes
 * every rule the customer had, so swallowing a decode failure here would quietly destroy their
 * configuration; failing the apply surfaces it instead.
 */
export const decodeRules = (encoded: string): RedactionRule[] => {
  const parsed = encodedRulesSchema.safeParse(JSON.parse(encoded))
  if (!parsed.success) throw new Error("Could not read the redaction rules on this page. Reload and try again.")

  return parsed.data
}

export const newRuleDraft = (kind: RedactionRuleKind): RedactionRule => {
  const id = generateId()

  if (kind === "attribute_key") return { id, kind, label: "", keys: [] }
  if (kind === "terms") return { id, kind, label: "", terms: [] }

  return { id, kind, label: "", pattern: "" }
}

/** Turns a human name into the placeholder label, which is what appears in stored content. */
export const toRuleLabel = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32)

export const labelIssue = (label: string): string | undefined => {
  if (label === "") return undefined
  if (RESERVED_REDACTION_LABELS.has(label)) return `${label} is already used by a built-in category.`
  if (!REDACTION_RULE_LABEL_PATTERN.test(label)) {
    return "Use 3 to 32 characters: capitals, digits and underscores, starting with a letter."
  }

  return undefined
}

/** Whether the draft is complete enough to be worth validating on the server. */
export const isRuleDraftReady = (rule: RedactionRule): boolean => {
  if (labelIssue(rule.label) !== undefined || rule.label === "") return false
  if (rule.kind === "attribute_key") return rule.keys.length > 0
  if (rule.kind === "terms") return rule.terms.length > 0

  return rule.pattern.length > 0
}

export const describeRule = (rule: RedactionRule): string => {
  if (rule.kind === "attribute_key") return rule.keys.join(", ")
  if (rule.kind === "terms") {
    const shown = rule.terms.slice(0, 3).join(", ")
    return rule.terms.length > 3 ? `${shown} and ${rule.terms.length - 3} more` : shown
  }

  return rule.pattern
}

export const withRuleReplaced = (rules: readonly RedactionRule[], next: RedactionRule): RedactionRule[] => {
  const existing = rules.findIndex((rule) => rule.id === next.id)
  if (existing === -1) return [...rules, next]

  return rules.map((rule) => (rule.id === next.id ? next : rule))
}
