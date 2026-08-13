import { z } from "zod"

/**
 * Cloud regions we import from, and the API origin each one answers on.
 *
 * The user picks a region, never a URL. Regions are fully separated deployments — a Langfuse
 * EU account does not exist in US, a Braintrust org lives on exactly one data plane — so the
 * region is a real thing the user knows about their account, and the origin is ours. That is
 * also the whole security story: there is no caller-supplied host to point at an internal
 * address, so nothing here needs to defend against one.
 *
 * Self-hosted deployments are deliberately out of scope for this version.
 */
const LANGFUSE_REGIONS = ["eu", "us", "jp", "hipaa-us"] as const
export const langfuseRegionSchema = z.enum(LANGFUSE_REGIONS)
type LangfuseRegion = z.infer<typeof langfuseRegionSchema>

const LANGSMITH_REGIONS = ["gcp-eu", "gcp-us", "gcp-apac", "aws-us"] as const
export const langsmithRegionSchema = z.enum(LANGSMITH_REGIONS)
type LangsmithRegion = z.infer<typeof langsmithRegionSchema>

const BRAINTRUST_REGIONS = ["eu", "us"] as const
export const braintrustRegionSchema = z.enum(BRAINTRUST_REGIONS)
type BraintrustRegion = z.infer<typeof braintrustRegionSchema>

interface RegionDefinition {
  /** What the wizard shows. Names the cloud and the locale the user chose at signup. */
  readonly label: string
  readonly baseUrl: string
}

/** Host origin; the adapter appends `/api/public/...`. */
export const LANGFUSE_REGION_DEFINITIONS: Record<LangfuseRegion, RegionDefinition> = {
  eu: { label: "EU (Ireland)", baseUrl: "https://cloud.langfuse.com" },
  us: { label: "US (Oregon)", baseUrl: "https://us.cloud.langfuse.com" },
  jp: { label: "Japan (Tokyo)", baseUrl: "https://jp.cloud.langfuse.com" },
  "hipaa-us": { label: "HIPAA US (Oregon)", baseUrl: "https://hipaa.cloud.langfuse.com" },
}

/** The `LANGSMITH_ENDPOINT` values; note the region prefix sits before `api`. */
export const LANGSMITH_REGION_DEFINITIONS: Record<LangsmithRegion, RegionDefinition> = {
  "gcp-eu": { label: "GCP EU", baseUrl: "https://eu.api.smith.langchain.com" },
  "gcp-us": { label: "GCP US", baseUrl: "https://api.smith.langchain.com" },
  "gcp-apac": { label: "GCP APAC", baseUrl: "https://apac.api.smith.langchain.com" },
  "aws-us": { label: "AWS US", baseUrl: "https://aws.api.smith.langchain.com" },
}

/** Braintrust calls these data planes; a user finds theirs under Settings → Data plane. */
export const BRAINTRUST_REGION_DEFINITIONS: Record<BraintrustRegion, RegionDefinition> = {
  eu: { label: "EU", baseUrl: "https://api-eu.braintrust.dev" },
  us: { label: "US", baseUrl: "https://api.braintrust.dev" },
}

export interface ImportRegionOption<R extends string = string> {
  readonly id: R
  readonly label: string
}

const toOptions = <R extends string>(definitions: Record<R, RegionDefinition>): readonly ImportRegionOption<R>[] =>
  (Object.entries(definitions) as [R, RegionDefinition][]).map(([id, { label }]) => ({ id, label }))

/** What the wizard renders. Carries no base URLs: the client never needs to know them. */
export const IMPORT_SOURCE_REGION_OPTIONS: {
  readonly langfuse: readonly ImportRegionOption<LangfuseRegion>[]
  readonly langsmith: readonly ImportRegionOption<LangsmithRegion>[]
  readonly braintrust: readonly ImportRegionOption<BraintrustRegion>[]
} = {
  langfuse: toOptions(LANGFUSE_REGION_DEFINITIONS),
  langsmith: toOptions(LANGSMITH_REGION_DEFINITIONS),
  braintrust: toOptions(BRAINTRUST_REGION_DEFINITIONS),
}

const KNOWN_BASE_URLS: ReadonlySet<string> = new Set(
  [LANGFUSE_REGION_DEFINITIONS, LANGSMITH_REGION_DEFINITIONS, BRAINTRUST_REGION_DEFINITIONS].flatMap((definitions) =>
    Object.values(definitions).map(({ baseUrl }) => baseUrl),
  ),
)

/**
 * Gate on the stored config's base URL. Nothing outside this table is a legitimate import
 * target, so a config carrying anything else is rejected rather than requested.
 */
export const isKnownImportBaseUrl = (baseUrl: string): boolean => KNOWN_BASE_URLS.has(baseUrl)
