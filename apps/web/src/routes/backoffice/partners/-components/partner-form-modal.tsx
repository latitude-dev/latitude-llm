import { PARTNER_SCOPES, type PartnerScope } from "@domain/partners"
import { Button, CheckboxInput, CloseTrigger, FormWrapper, Input, Modal, TagsInput, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useRouter } from "@tanstack/react-router"
import type { AdminPartnerDto, AdminPartnerSecretDto } from "../../../../domains/admin/partners.functions.ts"
import { adminCreatePartner, adminUpdatePartner } from "../../../../domains/admin/partners.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../lib/form-server-action.ts"

const SCOPE_DESCRIPTIONS: Record<PartnerScope, string> = {
  "accounts:provision": "Create a Latitude account and an OAuth grant in one signed request.",
}

interface PartnerFormModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Absent when creating. */
  readonly partner?: AdminPartnerDto
  readonly onSecretMinted: (result: AdminPartnerSecretDto) => void
}

export function PartnerFormModal({ open, onOpenChange, partner, onSecretMinted }: PartnerFormModalProps) {
  const { toast } = useToast()
  const router = useRouter()
  const isEditing = partner !== undefined

  const form = useForm({
    defaultValues: {
      name: partner?.name ?? "",
      iconUrl: partner?.iconUrl ?? "",
      redirectUrls: partner?.redirectUrls ?? [],
      scopes: partner?.scopes ?? ([] as PartnerScope[]),
      allowedIps: partner?.allowedIps ?? [],
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const input = {
          name: value.name,
          iconUrl: value.iconUrl,
          redirectUrls: value.redirectUrls,
          scopes: value.scopes,
          allowedIps: value.allowedIps,
        }
        if (isEditing) {
          await adminUpdatePartner({ data: { partnerId: partner.id, ...input } })
          return { minted: null }
        }
        return { minted: await adminCreatePartner({ data: input }) }
      },
      {
        onSuccess: async ({ minted }) => {
          onOpenChange(false)
          form.reset()
          if (minted) onSecretMinted(minted)
          else toast({ description: "Partner updated." })
          await router.invalidate()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: isEditing ? "Could not update partner" : "Could not create partner",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  return (
    <Modal.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        onOpenChange(next)
      }}
    >
      <Modal.Content dismissible size="large">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <Modal.Header
            title={isEditing ? "Edit partner" : "Register partner"}
            description={
              <Text.H5 color="foregroundMuted">
                {isEditing
                  ? "The HMAC secret is unaffected by these changes. Rotate it separately."
                  : "The HMAC secret is generated on save and shown once."}
              </Text.H5>
            }
          />
          <Modal.Body>
            <FormWrapper>
              <form.Field name="name">
                {(field) => (
                  <Input
                    required
                    label="Name"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="Longitude"
                    autoComplete="off"
                  />
                )}
              </form.Field>
              <form.Field name="iconUrl">
                {(field) => (
                  <Input
                    label="Icon"
                    description="Shown to end users in Settings → Keys → OAuth Keys. Must be an http(s) URL. Leave empty for none."
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="https://longitude.example/icon.png"
                    autoComplete="off"
                  />
                )}
              </form.Field>
              <form.Field name="redirectUrls">
                {(field) => (
                  <TagsInput
                    label="OAuth redirect URLs"
                    description="The partner's OAuth callbacks, comma separated. Exact match — scheme, host and path. At least one is required."
                    value={field.state.value}
                    onChange={(next) => field.handleChange(next)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="https://app.longitude.example/oauth/callback"
                  />
                )}
              </form.Field>
              <form.Field name="scopes">
                {(field) => (
                  <div className="flex flex-col gap-2">
                    <Text.H5M>Scopes</Text.H5M>
                    {PARTNER_SCOPES.map((scope) => (
                      <CheckboxInput
                        key={scope}
                        label={scope}
                        description={SCOPE_DESCRIPTIONS[scope]}
                        checked={field.state.value.includes(scope)}
                        onCheckedChange={(checked) =>
                          field.handleChange(
                            checked === true
                              ? [...field.state.value, scope]
                              : field.state.value.filter((existing) => existing !== scope),
                          )
                        }
                      />
                    ))}
                    {fieldErrorsAsStrings(field.state.meta.errors)?.map((error) => (
                      <Text.H6 key={error} color="destructive">
                        {error}
                      </Text.H6>
                    ))}
                  </div>
                )}
              </form.Field>
              <form.Field name="allowedIps">
                {(field) => (
                  <TagsInput
                    label="Allowed IPs"
                    description="IP addresses or CIDR blocks, comma sepparated (203.0.113.7 or 203.0.113.0/24). Leave empty to accept any address."
                    value={field.state.value}
                    onChange={(next) => field.handleChange(next)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="203.0.113.7, 2001:db8::/32"
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" disabled={form.state.isSubmitting}>
              {form.state.isSubmitting
                ? isEditing
                  ? "Saving…"
                  : "Creating…"
                : isEditing
                  ? "Save changes"
                  : "Create partner"}
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}
