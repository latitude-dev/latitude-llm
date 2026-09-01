import { Button, Icon, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { Handshake, Plus } from "lucide-react"
import { useState } from "react"
import {
  type AdminPartnerDto,
  type AdminPartnerSecretDto,
  adminListPartners,
} from "../../../domains/admin/partners.functions.ts"
import { PartnerFormModal } from "./-components/partner-form-modal.tsx"
import { PartnerRow } from "./-components/partner-row.tsx"
import { PartnerSecretModal } from "./-components/partner-secret-modal.tsx"

export const Route = createFileRoute("/backoffice/partners/")({
  loader: async () => {
    const partners = await adminListPartners()
    return { partners }
  },
  component: BackofficePartnersPage,
})

function BackofficePartnersPage() {
  const { partners } = Route.useLoaderData() as { readonly partners: AdminPartnerDto[] }
  const [isCreating, setIsCreating] = useState(false)
  const [partnerToEdit, setPartnerToEdit] = useState<AdminPartnerDto | null>(null)
  const [mintedSecret, setMintedSecret] = useState<AdminPartnerSecretDto | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-8 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon icon={Handshake} size="sm" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H4 weight="semibold">Partners</Text.H4>
            <Text.H6 color="foregroundMuted">
              Vetted platforms allowed to call the private partner API with a signed request.
            </Text.H6>
          </div>
        </div>
        <Button size="sm" onClick={() => setIsCreating(true)}>
          <Icon icon={Plus} size="sm" />
          Register partner
        </Button>
      </div>

      {partners.length === 0 ? (
        <EmptyPartnersState />
      ) : (
        <div className="flex flex-col gap-2">
          {partners.map((partner) => (
            <PartnerRow
              key={partner.id}
              partner={partner}
              onEdit={() => setPartnerToEdit(partner)}
              onSecretMinted={setMintedSecret}
            />
          ))}
        </div>
      )}

      <PartnerFormModal open={isCreating} onOpenChange={setIsCreating} onSecretMinted={setMintedSecret} />
      {partnerToEdit ? (
        <PartnerFormModal
          open
          onOpenChange={(next) => {
            if (!next) setPartnerToEdit(null)
          }}
          partner={partnerToEdit}
          onSecretMinted={setMintedSecret}
        />
      ) : null}
      <PartnerSecretModal secret={mintedSecret} onClose={() => setMintedSecret(null)} />
    </div>
  )
}

function EmptyPartnersState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={Handshake} size="default" />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <Text.H5 weight="medium">No partners registered</Text.H5>
        <Text.H6 color="foregroundMuted">
          Register one to hand out an HMAC secret. Until then, every request to the private partner API is refused.
        </Text.H6>
      </div>
    </div>
  )
}
