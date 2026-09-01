import { Badge, CopyableText, DropdownMenu, type MenuOption, Status, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { KeyRound, Pencil, Power, PowerOff, Trash2 } from "lucide-react"
import { useState } from "react"
import type { AdminPartnerDto, AdminPartnerSecretDto } from "../../../../domains/admin/partners.functions.ts"
import {
  adminDeletePartner,
  adminRotatePartnerSecret,
  adminSetPartnerEnabled,
} from "../../../../domains/admin/partners.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { ConfirmDialog } from "../../feature-flags/-components/confirm-dialog.tsx"

type ConfirmKind = "rotate" | "disable" | "enable" | "delete" | null

interface PartnerRowProps {
  readonly partner: AdminPartnerDto
  readonly onEdit: () => void
  readonly onSecretMinted: (result: AdminPartnerSecretDto) => void
}

export function PartnerRow({ partner, onEdit, onSecretMinted }: PartnerRowProps) {
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
      if (kind === "rotate") {
        onSecretMinted(await adminRotatePartnerSecret({ data: { partnerId: partner.id } }))
      } else if (kind === "delete") {
        await adminDeletePartner({ data: { partnerId: partner.id } })
        toast({ description: `"${partner.name}" was deleted. Its signed requests now fail.` })
      } else {
        const enabled = kind === "enable"
        await adminSetPartnerEnabled({ data: { partnerId: partner.id, enabled } })
        toast({ description: `"${partner.name}" is now ${enabled ? "enabled" : "disabled"}.` })
      }
      setConfirm(null)
      void router.invalidate()
    } catch (error) {
      toast({ variant: "destructive", title: "Action failed", description: toUserMessage(error) })
    } finally {
      setIsBusy(false)
    }
  }

  const options: MenuOption[] = [
    { label: "Edit", iconProps: { icon: Pencil, size: "sm" }, onClick: onEdit },
    { label: "Rotate secret", iconProps: { icon: KeyRound, size: "sm" }, onClick: () => setConfirm("rotate") },
    partner.enabled
      ? { label: "Disable", iconProps: { icon: PowerOff, size: "sm" }, onClick: () => setConfirm("disable") }
      : { label: "Enable", iconProps: { icon: Power, size: "sm" }, onClick: () => setConfirm("enable") },
    {
      label: "Delete",
      iconProps: { icon: Trash2, size: "sm" },
      type: "destructive",
      onClick: () => setConfirm("delete"),
    },
  ]

  return (
    <>
      <div className="flex items-start gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          {partner.iconUrl ? (
            <img src={partner.iconUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Text.H6 color="foregroundMuted">{partner.name.slice(0, 1).toUpperCase()}</Text.H6>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Text.H5 weight="semibold" ellipsis>
              {partner.name}
            </Text.H5>
            <Status
              variant={partner.enabled ? "success" : "neutral"}
              label={partner.enabled ? "Enabled" : "Disabled"}
            />
            <CopyableText size="sm" value={partner.id} tooltip="Copy partner ID" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {partner.scopes.length === 0 ? (
              <Text.H6 color="foregroundMuted">No scopes — every private endpoint refuses this partner.</Text.H6>
            ) : (
              partner.scopes.map((scope) => (
                <Badge key={scope} variant="muted" noWrap>
                  {scope}
                </Badge>
              ))
            )}
          </div>
          <Text.H6 color="foregroundMuted">
            {partner.allowedIps.length === 0 ? "Any IP address" : `Only from ${partner.allowedIps.join(", ")}`}
          </Text.H6>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu
            options={options}
            triggerButtonProps={{ "aria-label": `Actions for ${partner.name}` }}
            align="end"
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "rotate"}
        onOpenChange={(next) => (next ? setConfirm("rotate") : closeConfirm())}
        title={`Rotate the secret for "${partner.name}"?`}
        description="The current secret stops verifying immediately — there is no grace window. Only rotate once the partner is ready to swap it in, or when the old one has leaked."
        confirmLabel="Rotate secret"
        busy={isBusy}
        onConfirm={() => void runAction("rotate")}
      />

      <ConfirmDialog
        open={confirm === "disable"}
        onOpenChange={(next) => (next ? setConfirm("disable") : closeConfirm())}
        title={`Disable "${partner.name}"?`}
        description="Every signed request from this partner starts failing right away. Accounts they already provisioned are untouched — those OAuth grants keep working until the end users revoke them."
        confirmLabel="Disable"
        destructive
        busy={isBusy}
        onConfirm={() => void runAction("disable")}
      />

      <ConfirmDialog
        open={confirm === "enable"}
        onOpenChange={(next) => (next ? setConfirm("enable") : closeConfirm())}
        title={`Enable "${partner.name}"?`}
        description="Signed requests within the partner's scopes start being accepted again. Their existing secret still applies."
        confirmLabel="Enable"
        busy={isBusy}
        onConfirm={() => void runAction("enable")}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(next) => (next ? setConfirm("delete") : closeConfirm())}
        title={`Delete "${partner.name}"?`}
        description="The record is soft-deleted and disappears from this list; their signed requests fail from that moment. Accounts they already provisioned keep working — revoke those from each organization's OAuth Keys settings."
        confirmLabel="Delete partner"
        destructive
        busy={isBusy}
        onConfirm={() => void runAction("delete")}
      />
    </>
  )
}
