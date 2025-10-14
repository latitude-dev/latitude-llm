import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ActiveIntegrations } from './types'
import { normalizeIntegrations } from './utils'
import { CLIENT_TOOLS_INTEGRATION_NAME } from './collectTools'

/**
 * Updates the tools config from active integrations.
 * Preserves client tools, replaces or adds integration tools from activeIntegrations,
 * removes outdated ones, and deduplicates results while keeping original order.
 */
export function updateToolsFromActiveIntegrations({
  currentTools,
  activeIntegrations,
}: {
  currentTools: LatitudePromptConfig['tools']
  activeIntegrations: ActiveIntegrations
}) {
  const normalized = normalizeIntegrations(currentTools)

  // Build replacements for each integration based on ActiveIntegrations
  // Skip client tools - they're read-only and defined inline in the config
  const replacements = new Map<string, string[]>()
  for (const { name, tools } of Object.values(activeIntegrations)) {
    // Skip client tools integration - they're already in the config as objects
    if (name === CLIENT_TOOLS_INTEGRATION_NAME) continue

    if (tools === true) {
      replacements.set(name, [`${name}/*`])
    } else if (Array.isArray(tools)) {
      replacements.set(
        name,
        tools.map((t) => `${name}/${t}`),
      )
    } else {
      // Defensive: ignore unexpected shapes
      replacements.set(name, [])
    }
  }

  // Track which integrations we have already placed (in-place)
  const placed = new Set<string>()

  const result: (string | Record<string, unknown>)[] = []

  for (const entry of normalized) {
    if (typeof entry !== 'string') {
      // Client tool: keep as is in original position
      result.push(entry)
      continue
    }

    const [integrationName] = entry.split('/')

    if (replacements.has(integrationName)) {
      // This integration is being managed by activeIntegrations:
      // replace the original string IN-PLACE with its new set (once).
      if (!placed.has(integrationName)) {
        const rep = replacements.get(integrationName)!
        result.push(...rep)
        placed.add(integrationName)
      }
      // Skip the original string (we already replaced it)
      continue
    }

    // Integration not present in activeIntegrations: drop it
    // (we do not push it to result)
  }

  // Append any integrations that were NOT present in the original config
  for (const [name, rep] of replacements.entries()) {
    if (!placed.has(name)) {
      result.push(...rep)
      placed.add(name)
    }
  }

  // Deduplicate integration strings; keep client tools as-is
  const seen = new Set<string>()
  const deduped = result.filter((item) => {
    if (typeof item !== 'string') return true
    if (seen.has(item)) return false
    seen.add(item)
    return true
  })

  return deduped as LatitudePromptConfig['tools']
}
