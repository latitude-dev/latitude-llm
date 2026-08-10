import type { OrganizationRedactionSetting, RedactionRule } from "@domain/shared"
import { type RuleValidation, validateRedactionRule } from "@domain/spans"

interface RejectedRedactionRule {
  readonly rule: RedactionRule
  readonly reason: string
}

/**
 * Rejects a redaction setting whose rules cannot be trusted, before it is stored.
 *
 * The gate lives at the write boundary rather than in the update use cases, because
 * `@domain/spans` depends on `@domain/projects` and validating there would close a cycle. It
 * runs the same `validateRedactionRule` the rule editor calls, so the editor can never show a
 * verdict the write disagrees with.
 *
 * Write-time is the only time this runs. The ingest path compiles rules without revalidating
 * them, since a source scan and a timing probe per batch would cost more than the redaction.
 */
export function rejectInvalidRedactionRules(
  setting: OrganizationRedactionSetting | null,
): RejectedRedactionRule | null {
  const rules = setting?.rules
  if (!rules || rules.length === 0) return null

  const seenIds = new Set<string>()
  for (const rule of rules) {
    if (seenIds.has(rule.id)) {
      return { rule, reason: `two rules share the id ${rule.id}` }
    }
    seenIds.add(rule.id)

    const validation = validateRedactionRule(rule)
    if (!validation.ok) return { rule, reason: describe(validation) }
  }

  return null
}

const describe = (validation: RuleValidation): string => validation.errors.map((issue) => issue.message).join("; ")

/** The label is punctuated off the reason, which otherwise runs into it as one unreadable sentence. */
export const rejectionMessage = (rejected: RejectedRedactionRule): string =>
  `Rule "${rejected.rule.label}": ${rejected.reason}`
