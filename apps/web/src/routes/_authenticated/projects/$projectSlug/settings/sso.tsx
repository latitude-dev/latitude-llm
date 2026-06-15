import { Badge, Button, CopyButton, Icon, Input, Modal, Switch, TabSelector, Text, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { ShieldCheck } from "lucide-react"
import { useState } from "react"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useMembersCollection } from "../../../../../domains/members/members.collection.ts"
import {
  deleteSsoProviderMutation,
  getSsoDomainVerificationRecordMutation,
  registerSsoProviderMutation,
  updateSsoEnforcementMutation,
  useOrgSsoProvider,
  verifySsoDomainMutation,
} from "../../../../../domains/sso/sso.collection.ts"
import type { SsoDomainVerificationRecordDto, SsoProviderDto } from "../../../../../domains/sso/sso.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { useAuthenticatedUser } from "../../../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/sso")({
  component: SsoSettingsPage,
})

const PAGE_TITLE = "Single sign-on"
const PAGE_DESCRIPTION = "Let your team sign in to Latitude through your identity provider (SAML or OIDC)."
const ENTERPRISE_SSO_SALES_URL = "mailto:hello@latitude.so?subject=Latitude%20Enterprise%20SSO"

function SsoSettingsPage() {
  const ssoEnabled = useHasFeatureFlag("sso")

  if (!ssoEnabled) {
    return (
      <SettingsPage title={PAGE_TITLE} description={PAGE_DESCRIPTION}>
        <SsoUpsellCard />
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title={PAGE_TITLE} description={PAGE_DESCRIPTION}>
      <div className="flex w-full flex-col gap-6 @[800px]:w-2/3">
        <SsoProviderSection />
      </div>
    </SettingsPage>
  )
}

function SsoUpsellCard() {
  return (
    <div className="flex w-full flex-col gap-6 @[800px]:w-2/3">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 p-6">
        <div className="flex min-w-0 flex-row items-start gap-4">
          <Icon icon={ShieldCheck} size="md" color="primary" className="shrink-0 pt-0.5" />
          <div className="flex min-w-0 flex-col gap-1">
            <Text.H4 weight="bold">SAML Single Sign-On</Text.H4>
            <Text.H5 color="primary">
              Upgrade to the Enterprise plan to let users from your trusted domains sign in with your organization's
              Identity Provider.
            </Text.H5>
          </div>
        </div>
        <Button asChild>
          <a href={ENTERPRISE_SSO_SALES_URL}>Talk to sales</a>
        </Button>
      </div>
    </div>
  )
}

/** Owner/admin gate computed client-side; every mutation re-checks server-side. */
function useIsOrgAdmin(): boolean {
  const user = useAuthenticatedUser()
  const { data: memberData } = useMembersCollection()
  const myMembership = (memberData ?? []).find((member) => member.userId === user.id)
  return myMembership?.role === "owner" || myMembership?.role === "admin"
}

function SsoProviderSection() {
  const { provider, isLoading } = useOrgSsoProvider()
  const isAdmin = useIsOrgAdmin()
  // Surfaced right after registration so the DNS instructions show up
  // without an extra round-trip; afterwards fetched on demand.
  const [verificationRecord, setVerificationRecord] = useState<SsoDomainVerificationRecordDto | null>(null)

  if (isLoading) return null

  if (!provider) {
    if (!isAdmin) {
      return (
        <div className="rounded-lg border border-border bg-muted/30 p-6">
          <Text.H5 color="foregroundMuted">
            No SSO provider is configured yet. Ask an organization owner or admin to set one up.
          </Text.H5>
        </div>
      )
    }
    return <RegisterProviderCard onRegistered={setVerificationRecord} />
  }

  return <ProviderCard provider={provider} isAdmin={isAdmin} initialVerificationRecord={verificationRecord} />
}

function RegisterProviderCard({ onRegistered }: { onRegistered: (record: SsoDomainVerificationRecordDto) => void }) {
  const [kind, setKind] = useState<"saml" | "oidc">("saml")

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-6">
      <div className="flex flex-col gap-1">
        <Text.H4 weight="bold">Connect your identity provider</Text.H4>
        <Text.H5 color="foregroundMuted">
          Members with a verified email domain will be able to sign in through your IdP.
        </Text.H5>
      </div>
      <div className="self-start">
        <TabSelector<"saml" | "oidc">
          options={[
            { label: "SAML 2.0", value: "saml" },
            { label: "OIDC", value: "oidc" },
          ]}
          selected={kind}
          onSelect={setKind}
        />
      </div>
      {kind === "saml" ? (
        <SamlRegisterForm onRegistered={onRegistered} />
      ) : (
        <OidcRegisterForm onRegistered={onRegistered} />
      )}
    </div>
  )
}

function SamlRegisterForm({ onRegistered }: { onRegistered: (record: SsoDomainVerificationRecordDto) => void }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: { domain: "", issuer: "", entryPoint: "", idpCert: "" },
    onSubmit: createFormSubmitHandler(
      async (values) => {
        const result = await registerSsoProviderMutation({ kind: "saml", ...values })
        onRegistered(result.verificationRecord)
      },
      {
        resetOnSuccess: false,
        onSuccess: () => {
          toast({ description: "SAML provider configured" })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="domain">
        {(field) => (
          <Input
            type="text"
            name={field.name}
            label="Email domain"
            description="Users with this email domain will sign in through your IdP after verification."
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder="acme.com"
          />
        )}
      </form.Field>
      <form.Field name="issuer">
        {(field) => (
          <Input
            type="text"
            name={field.name}
            label="IdP issuer / Entity ID"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder="https://idp.acme.com/saml/metadata"
          />
        )}
      </form.Field>
      <form.Field name="entryPoint">
        {(field) => (
          <Input
            type="text"
            name={field.name}
            label="IdP single sign-on URL"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder="https://idp.acme.com/saml/sso"
          />
        )}
      </form.Field>
      <form.Field name="idpCert">
        {(field) => (
          <Textarea
            name={field.name}
            label="IdP X.509 certificate"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder={"-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"}
            rows={6}
          />
        )}
      </form.Field>
      <div className="self-start">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isLoading={isSubmitting}>
              Connect SAML provider
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

function OidcRegisterForm({ onRegistered }: { onRegistered: (record: SsoDomainVerificationRecordDto) => void }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: { domain: "", issuer: "", clientId: "", clientSecret: "" },
    onSubmit: createFormSubmitHandler(
      async (values) => {
        const result = await registerSsoProviderMutation({ kind: "oidc", ...values })
        onRegistered(result.verificationRecord)
      },
      {
        resetOnSuccess: false,
        onSuccess: () => {
          toast({ description: "OIDC provider configured" })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="domain">
        {(field) => (
          <Input
            type="text"
            name={field.name}
            label="Email domain"
            description="Users with this email domain will sign in through your IdP after verification."
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder="acme.com"
          />
        )}
      </form.Field>
      <form.Field name="issuer">
        {(field) => (
          <Input
            type="text"
            name={field.name}
            label="Issuer URL"
            description="OIDC discovery is fetched from <issuer>/.well-known/openid-configuration."
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder="https://acme.okta.com"
          />
        )}
      </form.Field>
      <form.Field name="clientId">
        {(field) => (
          <Input
            type="text"
            name={field.name}
            label="Client ID"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="clientSecret">
        {(field) => (
          <Input
            type="password"
            name={field.name}
            label="Client secret"
            description="Stored server-side and never shown again."
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
          />
        )}
      </form.Field>
      <div className="self-start">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isLoading={isSubmitting}>
              Connect OIDC provider
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <div className="flex flex-row items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

function ProviderCard({
  provider,
  isAdmin,
  initialVerificationRecord,
}: {
  provider: SsoProviderDto
  isAdmin: boolean
  initialVerificationRecord: SsoDomainVerificationRecordDto | null
}) {
  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border p-6">
        <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-row items-center gap-2">
              <Text.H4 weight="bold">{provider.domain}</Text.H4>
              <Badge variant="outline">{provider.kind === "saml" ? "SAML 2.0" : "OIDC"}</Badge>
              {provider.domainVerified ? (
                <Badge variant="default">Domain verified</Badge>
              ) : (
                <Badge variant="warningMuted">Domain unverified</Badge>
              )}
            </div>
            <Text.H6 color="foregroundMuted">Issuer: {provider.issuer}</Text.H6>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <Text.H5 weight="semibold">Configure your IdP with these values</Text.H5>
          {provider.kind === "saml" ? (
            <>
              <CopyableField label="Single sign-on URL (ACS)" value={provider.acsUrl} />
              <CopyableField label="Audience URI (SP Entity ID)" value={provider.spEntityId} />
              <CopyableField label="SP metadata URL" value={provider.spMetadataUrl} />
            </>
          ) : (
            <CopyableField label="Redirect URL" value={provider.oidcCallbackUrl} />
          )}
        </div>
      </div>

      {!provider.domainVerified && (
        <DomainVerificationCard provider={provider} isAdmin={isAdmin} initialRecord={initialVerificationRecord} />
      )}

      {isAdmin && <EnforcementCard provider={provider} />}
      {isAdmin && <DangerZoneCard provider={provider} />}
    </>
  )
}

function DomainVerificationCard({
  provider,
  isAdmin,
  initialRecord,
}: {
  provider: SsoProviderDto
  isAdmin: boolean
  initialRecord: SsoDomainVerificationRecordDto | null
}) {
  const { toast } = useToast()
  const [record, setRecord] = useState<SsoDomainVerificationRecordDto | null>(initialRecord)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const loadRecord = async () => {
    setLoadingRecord(true)
    try {
      setRecord(await getSsoDomainVerificationRecordMutation())
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setLoadingRecord(false)
    }
  }

  const verify = async () => {
    setVerifying(true)
    try {
      const result = await verifySsoDomainMutation()
      if (result.verified) {
        toast({ description: `${provider.domain} verified — SSO sign-in is now active` })
      } else {
        toast({ variant: "destructive", description: result.message ?? "Domain verification failed" })
      }
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-6">
      <Text.H5 weight="semibold">Verify your domain</Text.H5>
      <Text.H6 color="foregroundMuted">
        SSO sign-in stays inactive until you prove ownership of {provider.domain} with a DNS TXT record.
      </Text.H6>
      {record ? (
        <>
          <CopyableField label="TXT record host" value={record.host} />
          <CopyableField label="TXT record value" value={record.value} />
        </>
      ) : (
        isAdmin && (
          <div className="self-start">
            <Button variant="outline" onClick={() => void loadRecord()} isLoading={loadingRecord}>
              Show DNS record
            </Button>
          </div>
        )
      )}
      {isAdmin && (
        <div className="self-start">
          <Button onClick={() => void verify()} isLoading={verifying}>
            Verify domain
          </Button>
        </div>
      )}
    </div>
  )
}

function EnforcementCard({ provider }: { provider: SsoProviderDto }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const toggle = async (enforced: boolean) => {
    setSaving(true)
    try {
      await updateSsoEnforcementMutation(enforced)
      toast({ description: enforced ? "SSO is now required for your domain" : "SSO is no longer required" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-row items-center justify-between gap-4 rounded-lg border border-border p-6">
      <div className="flex flex-col gap-1">
        <Text.H5 weight="semibold">Require SSO</Text.H5>
        <Text.H6 color="foregroundMuted">
          Block magic-link and social sign-in for @{provider.domain} emails. Only available once the domain is verified.
        </Text.H6>
      </div>
      <Switch
        checked={provider.enforced}
        onCheckedChange={(checked) => void toggle(checked)}
        disabled={!provider.domainVerified || saving}
        loading={saving}
      />
    </div>
  )
}

function DangerZoneCard({ provider }: { provider: SsoProviderDto }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteSsoProviderMutation()
      toast({ description: "SSO provider removed" })
      setOpen(false)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex flex-col gap-1">
        <Text.H5 weight="semibold" color="destructive">
          Remove SSO provider
        </Text.H5>
        <Text.H6 color="foregroundMuted">
          Members of @{provider.domain} will fall back to magic-link and social sign-in.
        </Text.H6>
      </div>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <Modal
        dismissible
        open={open}
        onOpenChange={(value) => {
          if (!deleting) setOpen(value)
        }}
        title="Remove SSO provider"
        description={`Single sign-on for @${provider.domain} will stop working immediately. Members keep their accounts and can sign in with a magic link instead.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} isLoading={deleting}>
              Remove provider
            </Button>
          </>
        }
      />
    </div>
  )
}
