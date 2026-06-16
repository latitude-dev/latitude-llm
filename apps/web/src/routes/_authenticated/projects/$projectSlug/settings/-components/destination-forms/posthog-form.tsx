import { POSTHOG_EU_INGESTION_HOST, POSTHOG_US_INGESTION_HOST } from "@domain/destinations"
import { Input, Select, SwitchInput } from "@repo/ui"
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
    excludePayloads: boolean
  }
  credentials: {
    apiKey: string
  }
}

function PosthogFields({ form, isEdit, destination }: DestinationFieldsProps<PosthogFormValues>) {
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

      <form.Field name="config.excludePayloads">
        {(field) => (
          <SwitchInput
            label="Redact payloads"
            description="Strip prompts, completions, tool schemas, and error messages before sending. Tokens, cost, latency, and timing still flow."
            checked={field.state.value}
            onCheckedChange={(checked) => field.handleChange(checked)}
          />
        )}
      </form.Field>
    </>
  )
}

export const posthogFormModule: DestinationFormModule<PosthogFormValues> = {
  kind: "posthog",
  label: "PostHog",
  defaultValues: (destination) => {
    const initialHost = destination?.config.host ?? POSTHOG_US_INGESTION_HOST
    const region = presetForHost(initialHost)
    return {
      config: {
        region,
        host: region === "custom" ? initialHost : "",
        excludePayloads: destination?.config.excludePayloads ?? false,
      },
      credentials: { apiKey: "" },
    }
  },
  buildConfig: (values) => ({
    kind: "posthog",
    host: hostForPreset(values.config.region, values.config.host.trim()),
    excludePayloads: values.config.excludePayloads,
  }),
  buildCredentials: (values) => ({ kind: "posthog", apiKey: values.credentials.apiKey.trim() }),
  credentialsProvided: (values) => values.credentials.apiKey.trim() !== "",
  Fields: PosthogFields,
}
