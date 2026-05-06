import { Badge, CopyButton, DropdownMenu, type MenuOption, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { Archive, Globe, GlobeLock, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  type AdminFeatureFlagDto,
  adminArchiveFeatureFlag,
  adminDeleteFeatureFlag,
  adminDisableFeatureFlagForAll,
  adminEnableFeatureFlagForAll,
  adminUnarchiveFeatureFlag,
} from "../../../../domains/admin/feature-flags.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { ConfirmDialog } from "./confirm-dialog.tsx"
import { EditFeatureFlagModal } from "./edit-feature-flag-modal.tsx"
import { EnabledOrganizationsPopover } from "./enabled-organizations-popover.tsx"

type ConfirmKind = "archive" | "globalEnable" | "globalDisable" | "unarchive" | "delete" | null

interface FeatureFlagRowProps {
  readonly featureFlag: AdminFeatureFlagDto
  readonly archived?: boolean
}

export function FeatureFlagRow({ featureFlag, archived = false }: FeatureFlagRowProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmKind>(null)
  const [isBusy, setIsBusy] = useState(false)

  const closeConfirm = () => {
    if (isBusy) return
    setConfirm(null)
  }

  const runAction = async (kind: Exclude<ConfirmKind, null>) => {
    setIsBusy(true)
    try {
      if (kind === "archive") {
        await adminArchiveFeatureFlag({ data: { identifier: featureFlag.identifier } })
        toast({ description: `Archived "${featureFlag.identifier}".` })
      } else if (kind === "unarchive") {
        await adminUnarchiveFeatureFlag({ data: { identifier: featureFlag.identifier } })
        toast({ description: `Unarchived "${featureFlag.identifier}".` })
      } else if (kind === "delete") {
        await adminDeleteFeatureFlag({ data: { identifier: featureFlag.identifier } })
        toast({ description: `Deleted "${featureFlag.identifier}" permanently.` })
      } else if (kind === "globalEnable") {
        await adminEnableFeatureFlagForAll({ data: { identifier: featureFlag.identifier } })
        toast({ description: `"${featureFlag.identifier}" is now enabled for every organization.` })
      } else if (kind === "globalDisable") {
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

  const options: MenuOption[] = archived
    ? [
        {
          label: "Unarchive",
          iconProps: { icon: RotateCcw, size: "sm" },
          onClick: () => setConfirm("unarchive"),
        },
        {
          label: "Delete permanently",
          type: "destructive",
          iconProps: { icon: Trash2, size: "sm", color: "destructive" },
          onClick: () => setConfirm("delete"),
        },
      ]
    : [
        {
          label: "Edit",
          iconProps: { icon: Pencil, size: "sm" },
          onClick: () => setEditOpen(true),
        },
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
        {
          label: "Archive",
          type: "destructive",
          iconProps: { icon: Archive, size: "sm", color: "destructive" },
          onClick: () => setConfirm("archive"),
        },
      ]

  return (
    <>
      <div className="flex items-start gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {featureFlag.name ? (
              <Text.H5 weight="semibold" ellipsis>
                {featureFlag.name}
              </Text.H5>
            ) : null}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{featureFlag.identifier}</code>
            <CopyButton value={featureFlag.identifier} tooltip="Copy identifier" />
          </div>
          {featureFlag.description ? (
            <Text.H6 color="foregroundMuted">{featureFlag.description}</Text.H6>
          ) : (
            <Text.H6 color="foregroundMuted">No description.</Text.H6>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!archived ? <EnablementBadge featureFlag={featureFlag} /> : null}
          <DropdownMenu
            options={options}
            triggerButtonProps={{ "aria-label": `Actions for ${featureFlag.identifier}` }}
            align="end"
          />
        </div>
      </div>

      {!archived ? <EditFeatureFlagModal featureFlag={featureFlag} open={editOpen} onOpenChange={setEditOpen} /> : null}

      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(next) => (next ? setConfirm("archive") : closeConfirm())}
        title={`Archive "${featureFlag.identifier}"?`}
        description="Archived flags stop applying to every organization, even those it was enabled for. You can unarchive later."
        confirmLabel="Archive"
        destructive
        busy={isBusy}
        onConfirm={() => void runAction("archive")}
      />

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

      <ConfirmDialog
        open={confirm === "unarchive"}
        onOpenChange={(next) => (next ? setConfirm("unarchive") : closeConfirm())}
        title={`Unarchive "${featureFlag.identifier}"?`}
        description="The flag will return to the active list with its previous enablements still recorded."
        confirmLabel="Unarchive"
        busy={isBusy}
        onConfirm={() => void runAction("unarchive")}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(next) => (next ? setConfirm("delete") : closeConfirm())}
        title={`Delete "${featureFlag.identifier}" permanently?`}
        description="This removes the flag and any leftover organization enablements. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        busy={isBusy}
        onConfirm={() => void runAction("delete")}
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
