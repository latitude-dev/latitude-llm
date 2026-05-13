import { Icon, Text } from "@repo/ui"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import type { AdminFeatureFlagDto } from "../../../../domains/admin/feature-flags.functions.ts"
import { FeatureFlagRow } from "./feature-flag-row.tsx"

interface ArchivedFlagsSectionProps {
  readonly featureFlags: AdminFeatureFlagDto[]
}

export function ArchivedFlagsSection({ featureFlags }: ArchivedFlagsSectionProps) {
  const [expanded, setExpanded] = useState(false)

  if (featureFlags.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center gap-2 self-start rounded px-1 py-0.5 text-left transition hover:bg-muted"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span
          className={`inline-flex transition-transform duration-150 ${expanded ? "rotate-90" : "rotate-0"}`}
          aria-hidden="true"
        >
          <Icon icon={ChevronRight} size="sm" color="foregroundMuted" />
        </span>
        <Text.H5 weight="medium" color="foregroundMuted">
          {featureFlags.length === 1 ? "Archived flags (1)" : `Archived flags (${featureFlags.length})`}
        </Text.H5>
      </button>
      {expanded ? (
        <div className="flex flex-col gap-2">
          {featureFlags.map((featureFlag) => (
            <FeatureFlagRow key={featureFlag.id} featureFlag={featureFlag} archived />
          ))}
        </div>
      ) : null}
    </div>
  )
}
