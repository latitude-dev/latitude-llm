import { Badge, CopyButton, DropdownMenu, type MenuOption, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { Globe, GlobeLock } from "lucide-react"
import { useState } from "react"
import {
  type AdminFeatureFlagDto,
  adminDisableFeatureFlagForAll,
  adminEnableFeatureFlagForAll,
} from "../../../../domains/admin/feature-flags.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { ConfirmDialog } from "./confirm-dialog.tsx"
import { EnabledOrganizationsPopover } from "./enabled-organizations-popover.tsx"

type ConfirmKind = "globalEnable" | "globalDisable" | null

interface FeatureFlagRowProps {
  readonly featureFlag: AdminFeatureFlagDto
}

export function FeatureFlagRow({ featureFlag }: FeatureFlagRowProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState<ConfirmKind>(null)
  const [isBusy, setIsBusy] = useState(false)

  const closeConfirm = () => {
    if (isBusy) return
    setConfirm(null)
  }

  const runAction = async (kind: Exclude<ConfirmKind, null>) => {
    setIsBusy(true)
    try {
      if (kind === "globalEnable") {
        await adminEnableFeatureFlagForAll({ data: { identifier: featureFlag.identifier } })
        toast({ description: `"${featureFlag.identifier}" is now enabled for every organization.` })
      } else {
        await adminDisableFeatureFlagForAll({ data: { identifier: featureFlag.identifier } })
        toast({ description: `"${featureFlag.identifier}" is no longer enabled for every organization.` })
      }
      setConfirm(null)
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: toUserMessage(error),
      })
    } finally {
      setIsBusy(false)
    }
  }

  const options: MenuOption[] = [
    featureFlag.enabledForAll
      ? {
          label: "Disable globally",
          iconProps: { icon: GlobeLock, size: "sm" },
          onClick: () => setConfirm("globalDisable"),
        }
      : {
          label: "Enable globally",
          iconProps: { icon: Globe, size: "sm" },
          onClick: () => setConfirm("globalEnable"),
        },
  ]

  return (
    <>
      <div className="flex items-start gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <span className="text-base leading-none">{featureFlag.emoji}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Text.H5 weight="semibold" ellipsis>
              {featureFlag.name}
            </Text.H5>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{featureFlag.identifier}</code>
            <CopyButton value={featureFlag.identifier} tooltip="Copy identifier" />
          </div>
          <Text.H6 color="foregroundMuted">{featureFlag.description}</Text.H6>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <EnablementBadge featureFlag={featureFlag} />
          <DropdownMenu
            options={options}
            triggerButtonProps={{ "aria-label": `Actions for ${featureFlag.identifier}` }}
            align="end"
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "globalEnable"}
        onOpenChange={(next) => (next ? setConfirm("globalEnable") : closeConfirm())}
        title={`Enable "${featureFlag.identifier}" for every organization?`}
        description="Every organization will see this flag as enabled until you turn it off again. Per-org enablements remain recorded so they take over if you disable globally."
        confirmLabel="Enable globally"
        busy={isBusy}
        onConfirm={() => void runAction("globalEnable")}
      />

      <ConfirmDialog
        open={confirm === "globalDisable"}
        onOpenChange={(next) => (next ? setConfirm("globalDisable") : closeConfirm())}
        title={`Disable "${featureFlag.identifier}" globally?`}
        description="Organizations that were explicitly enabled will keep the flag. Everyone else loses access."
        confirmLabel="Disable globally"
        destructive
        busy={isBusy}
        onConfirm={() => void runAction("globalDisable")}
      />
    </>
  )
}

function EnablementBadge({ featureFlag }: { readonly featureFlag: AdminFeatureFlagDto }) {
  if (featureFlag.enabledForAll) {
    return (
      <Badge variant="outlineSuccessMuted" noWrap>
        Enabled for all
      </Badge>
    )
  }

  if (featureFlag.enabledOrganizations.length === 0) {
    return (
      <Badge variant="noBorderMuted" noWrap>
        No organizations
      </Badge>
    )
  }

  return (
    <EnabledOrganizationsPopover identifier={featureFlag.identifier} organizations={featureFlag.enabledOrganizations} />
  )
}
