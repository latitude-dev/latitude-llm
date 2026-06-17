import { POSTHOG_EU_INGESTION_HOST, POSTHOG_US_INGESTION_HOST } from "@domain/destinations"
import { CollapsibleBlock, Icon, Input, Select, SwitchInput, Text } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { EyeIcon } from "lucide-react"
import { previewDestinationDelivery } from "../../../../../../../domains/destinations/destinations.functions.ts"
import { fieldErrorsAsStrings } from "../../../../../../../lib/form-server-action.ts"
import type { DestinationFieldsProps, DestinationFormModule } from "./types.ts"

type HostPreset = "us" | "eu" | "custom"

const HOST_PRESET_OPTIONS: { label: string; value: HostPreset }[] = [
  { label: "United States (us.i.posthog.com)", value: "us" },
  { label: "Europe (eu.i.posthog.com)", value: "eu" },
  { label: "Custom URL", value: "custom" },
]

const presetForHost = (host: string): HostPreset => {
  if (host === POSTHOG_US_INGESTION_HOST) return "us"
  if (host === POSTHOG_EU_INGESTION_HOST) return "eu"
  return "custom"
}

const hostForPreset = (preset: HostPreset, customHost: string): string => {
  if (preset === "us") return POSTHOG_US_INGESTION_HOST
  if (preset === "eu") return POSTHOG_EU_INGESTION_HOST
  return customHost
}

/** PostHog form values. `region` is UI-only; `host` carries the custom URL and is ignored unless `region === "custom"`. */
interface PosthogFormValues {
  config: {
    region: HostPreset
    host: string
    // Per-source (spans) setting, kept here for form ergonomics — `buildConfig` ignores it; `buildSourceConfigs` routes it to the source config.
    excludePayloads: boolean
  }
  credentials: {
    apiKey: string
  }
}

const configFromValues = (values: PosthogFormValues) => ({
  kind: "posthog" as const,
  host: hostForPreset(values.config.region, values.config.host.trim()),
})

/**
 * Fetches and renders the mapped payload for the spans source. Keyed on the
 * candidate config so flipping "exclude payloads" (or the host) refetches; only
 * mounted while the preview block is expanded, so it loads on open.
 */
function SpansPreviewBody({
  projectId,
  host,
  excludePayloads,
}: {
  readonly projectId: string
  readonly host: string
  readonly excludePayloads: boolean
}) {
  const query = useQuery({
    queryKey: ["destination-preview", projectId, host, excludePayloads],
    queryFn: () =>
      previewDestinationDelivery({
        data: {
          projectId,
          config: { kind: "posthog", host },
          source: "spans",
          sourceConfig: { source: "spans", excludePayloads },
        },
      }),
  })

  if (query.isPending) return <Text.H6 color="foregroundMuted">Loading preview…</Text.H6>
  if (query.isError) {
    // Surface the cause in dev (401, schema mismatch, transport) without leaking it to users in prod.
    const detail = import.meta.env.DEV
      ? `: ${query.error instanceof Error ? query.error.message : String(query.error)}`
      : ""
    return <Text.H6 color="destructive">Couldn't load the preview{detail}.</Text.H6>
  }
  return query.data.hasData ? (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{query.data.eventsJson}</pre>
  ) : (
    <Text.H6 color="foregroundMuted">No data yet — send spans to this project to preview a payload.</Text.H6>
  )
}

/** Collapsible "what gets sent" preview, reactive to the current form settings. */
function SpansPreview({
  projectId,
  form,
}: {
  projectId: string
  form: DestinationFieldsProps<PosthogFormValues>["form"]
}) {
  return (
    <form.Subscribe
      selector={(state) => ({
        region: state.values.config.region,
        host: state.values.config.host,
        excludePayloads: state.values.config.excludePayloads,
      })}
    >
      {({ region, host, excludePayloads }) => (
        <CollapsibleBlock icon={<Icon icon={EyeIcon} size="sm" />} label="Preview what's sent">
          <SpansPreviewBody
            projectId={projectId}
            host={hostForPreset(region, host.trim())}
            excludePayloads={excludePayloads}
          />
        </CollapsibleBlock>
      )}
    </form.Subscribe>
  )
}

function PosthogFields({ form, isEdit, projectId, destination }: DestinationFieldsProps<PosthogFormValues>) {
  return (
    <>
      <form.Field name="config.region">
        {(field) => (
          <Select
            name="config.region"
            label="Region"
            description="US and EU pin PostHog's official ingestion hosts. Use Custom for a self-hosted instance."
            options={HOST_PRESET_OPTIONS}
            value={field.state.value}
            onChange={(value) => field.handleChange(value)}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.config.region}>
        {(region) =>
          region === "custom" ? (
            <form.Field name="config.host">
              {(field) => (
                <Input
                  required
                  label="Host URL"
                  placeholder="https://posthog.example.com"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              )}
            </form.Field>
          ) : null
        }
      </form.Subscribe>

      <form.Field name="credentials.apiKey">
        {(field) => (
          <Input
            type="password"
            required={!isEdit}
            label="Project API key"
            description={
              isEdit
                ? `Stored key: ${destination?.credentialsPreview ?? "—"}. Leave blank to keep it; saving a new key resets a quarantined destination.`
                : "Your PostHog project API key (starts with phc_)."
            }
            placeholder={isEdit ? "••••••••" : "phc_…"}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
          />
        )}
      </form.Field>

      <div className="flex flex-col gap-2">
        <Text.H5>Sources</Text.H5>
        <Text.H6 color="foregroundMuted">What this destination exports, and exactly how each record is sent.</Text.H6>
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <Text.H5M>Spans</Text.H5M>
          <form.Field name="config.excludePayloads">
            {(field) => (
              <SwitchInput
                label="Exclude payloads"
                description="Omit prompts, completions, tool schemas, and error messages from what's sent. Tokens, cost, latency, and timing still flow."
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            )}
          </form.Field>
          <SpansPreview projectId={projectId} form={form} />
        </div>
      </div>
    </>
  )
}

export const posthogFormModule: DestinationFormModule<PosthogFormValues> = {
  kind: "posthog",
  label: "PostHog",
  defaultValues: (destination) => {
    const initialHost = destination?.config.host ?? POSTHOG_US_INGESTION_HOST
    const region = presetForHost(initialHost)
    const spans = destination?.sources.find((s) => s.source === "spans")
    return {
      config: {
        region,
        host: region === "custom" ? initialHost : "",
        excludePayloads: spans?.config.excludePayloads ?? false,
      },
      credentials: { apiKey: "" },
    }
  },
  buildConfig: (values) => configFromValues(values),
  buildSourceConfigs: (values) => [{ source: "spans", excludePayloads: values.config.excludePayloads }],
  buildCredentials: (values) => ({ kind: "posthog", apiKey: values.credentials.apiKey.trim() }),
  credentialsProvided: (values) => values.credentials.apiKey.trim() !== "",
  Fields: PosthogFields,
}
