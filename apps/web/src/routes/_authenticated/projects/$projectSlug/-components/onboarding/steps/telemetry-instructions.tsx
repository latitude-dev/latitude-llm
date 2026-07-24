import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import {
  Badge,
  CodeBlock,
  CopyButton,
  OpentelemetryIcon,
  ProviderIcon,
  PythonIcon,
  Tabs,
  Text,
  TypescriptIcon,
} from "@repo/ui"
import { Bot, Terminal } from "lucide-react"
import type { ReactNode } from "react"
import { useLayoutEffect, useMemo, useState } from "react"
import { useApiKeysCollection } from "../../../../../../../domains/api-keys/api-keys.collection.ts"
import {
  type CodingMachineAgentId,
  cloudflareAiGatewayConfig,
  getCodingAgentTelemetryPrompt,
  getCodingMachineInstallDescription,
  getCodingMachineTelemetryInstallCommand,
  getEnvBlock,
  getHermesConfigYamlBlock,
  getHermesEnvBlock,
  getLatitudeTelemetryPyInstallCommand,
  getLatitudeTelemetryTsInstallCommand,
  getOnboardingSnippet,
  getOtelCurlVerifySnippet,
  getOtelExporterLanguageSnippet,
  getPiTelemetryInstallCommand,
  getProviderSdkPyInstallCommand,
  getProviderSdkTsInstallCommand,
  ONBOARDING_PROVIDER_SNIPPET_CONFIG,
  type OnboardingProviderId,
  OTEL_EXPORTER_LANGUAGE_OPTIONS,
  type OtelExporterLanguageId,
  PY_PACKAGE_MANAGERS,
  type PyPackageManager,
  providerUsesLatitudeSdk,
  type SdkLanguage,
  TS_PACKAGE_MANAGERS,
  type TsPackageManager,
} from "../../onboarding-integration-snippets.ts"

type TelemetrySetupMode = "coding-agent" | "manual"
type IntegrationPanel = "typescript" | "python" | "opentelemetry"
type TelemetryProviderId = OnboardingProviderId | CodingMachineAgentId

const SETUP_MODE_TAB_OPTIONS = [
  { id: "coding-agent" as const, label: "Coding agent", icon: <Bot className="h-4 w-4" /> },
  { id: "manual" as const, label: "Manual", icon: <Terminal className="h-4 w-4" /> },
] as const satisfies ReadonlyArray<{ id: TelemetrySetupMode; label: string; icon: ReactNode }>

interface ProviderEntry {
  readonly id: TelemetryProviderId
  readonly name: string
  readonly icon: string
}

function isCodingMachineProvider(id: TelemetryProviderId): id is CodingMachineAgentId {
  return id === "claude-code" || id === "openclaw" || id === "hermes" || id === "pi"
}

/** Order matches docs.latitude.so telemetry providers, then frameworks (see /telemetry/overview). */
const PROVIDER_ENTRIES: ReadonlyArray<ProviderEntry> = [
  { id: "claude-code", name: "Claude Code", icon: "claude-code" },
  { id: "openclaw", name: "OpenClaw", icon: "openclaw" },
  { id: "hermes", name: "Hermes", icon: "hermes" },
  { id: "pi", name: "Pi", icon: "pi" },
  { id: "openai", name: "OpenAI", icon: "openai" },
  { id: "anthropic", name: "Anthropic", icon: "anthropic" },
  { id: "gemini", name: "Gemini", icon: "google" },
  { id: "azure-openai", name: "Azure OpenAI", icon: "azure" },
  { id: "bedrock", name: "Amazon Bedrock", icon: "amazon-bedrock" },
  { id: "aiplatform", name: "Google AI Platform", icon: "google" },
  { id: "vertexai", name: "Vertex AI", icon: "google-vertex" },
  { id: "groq", name: "Groq", icon: "groq" },
  { id: "mistral", name: "Mistral", icon: "mistral" },
  { id: "ollama", name: "Ollama", icon: "llama" },
  { id: "cohere", name: "Cohere", icon: "cohere" },
  { id: "togetherai", name: "Together AI", icon: "togetherai" },
  { id: "litellm", name: "LiteLLM", icon: "litellm" },
  { id: "replicate", name: "Replicate", icon: "replicate" },
  { id: "sagemaker", name: "SageMaker", icon: "amazon-sagemaker" },
  { id: "watsonx", name: "Watsonx", icon: "watsonx" },
  { id: "aleph-alpha", name: "Aleph Alpha", icon: "aleph-alpha" },
  { id: "transformers", name: "Transformers", icon: "huggingface" },
  { id: "vercel-ai-sdk", name: "Vercel AI SDK", icon: "vercel" },
  { id: "vercel-ai-sdk-v7", name: "Vercel AI SDK v7", icon: "vercel" },
  { id: "langchain", name: "LangChain", icon: "langchain" },
  { id: "llamaindex", name: "LlamaIndex", icon: "llamaindex" },
  { id: "openai-agents", name: "OpenAI Agents", icon: "openai" },
  { id: "google-adk", name: "Google ADK", icon: "google" },
  { id: "crewai", name: "CrewAI", icon: "crewai" },
  { id: "haystack", name: "Haystack", icon: "haystack" },
  { id: "dspy", name: "DSPy", icon: "dspy" },
  { id: "eve", name: "Eve", icon: "eve" },
  { id: "flue", name: "Flue", icon: "flue" },
  { id: "elevenlabs", name: "ElevenLabs", icon: "elevenlabs" },
  { id: "pydantic-ai", name: "Pydantic AI", icon: "pydantic-ai" },
  { id: "cloudflare-ai-gateway", name: "Cloudflare AI Gateway", icon: "cloudflare-ai-gateway" },
]

function ProviderChipIcon({ provider }: { readonly provider: ProviderEntry }) {
  return <ProviderIcon provider={provider.icon} size="xs" />
}

function OtelExporterLanguageChips({
  active,
  onSelect,
}: {
  readonly active: OtelExporterLanguageId
  readonly onSelect: (id: OtelExporterLanguageId) => void
}) {
  return (
    <div className="flex flex-row flex-wrap gap-1">
      {OTEL_EXPORTER_LANGUAGE_OPTIONS.map(({ id, label }) => {
        const selected = active === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`h-6 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors ${selected ? "border-primary/30 bg-primary-muted text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Figma-style package manager chips (Latitude Sandbox command pattern). */
function PackageManagerChips<T extends string>({
  options,
  active,
  onSelect,
}: {
  readonly options: ReadonlyArray<T>
  readonly active: T
  readonly onSelect: (id: T) => void
}) {
  return (
    <div className="flex flex-row flex-wrap gap-1">
      {options.map((id) => {
        const selected = active === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`h-6 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors ${selected ? "border-primary/30 bg-primary-muted text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {id}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One install command with its own chip row; `active*` / `onSelect*` are shared across
 * Latitude SDK + provider fields so both stay in sync (same package manager everywhere).
 */
function InstallCommandField({
  command,
  isTs,
  tsPm,
  pyPm,
  onSelectTs,
  onSelectPy,
}: {
  readonly command: string
  readonly isTs: boolean
  readonly tsPm: TsPackageManager
  readonly pyPm: PyPackageManager
  readonly onSelectTs: (pm: TsPackageManager) => void
  readonly onSelectPy: (pm: PyPackageManager) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-2">
      <div className="flex w-full shrink-0 flex-row flex-wrap items-center justify-between gap-2">
        {isTs ? (
          <PackageManagerChips options={TS_PACKAGE_MANAGERS} active={tsPm} onSelect={onSelectTs} />
        ) : (
          <PackageManagerChips options={PY_PACKAGE_MANAGERS} active={pyPm} onSelect={onSelectPy} />
        )}
        <div className="ml-auto shrink-0">
          <CopyButton value={command} tooltip="Copy" size="sm" />
        </div>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg bg-muted">
        <CodeBlock value={command} copyable={false} className="rounded-lg bg-muted" />
      </div>
    </div>
  )
}

function SdkIntegrationInstructions({
  selectedProviderId,
  providerDisplayName,
  lang,
  slugForSnippets,
  defaultApiKeyToken,
}: {
  readonly selectedProviderId: OnboardingProviderId
  readonly providerDisplayName: string
  readonly lang: SdkLanguage
  readonly slugForSnippets: string
  readonly defaultApiKeyToken: string | null
}) {
  const [tsPm, setTsPm] = useState<TsPackageManager>("npm")
  const [pyPm, setPyPm] = useState<PyPackageManager>("pip")

  const snippet = getOnboardingSnippet(selectedProviderId, lang, slugForSnippets, defaultApiKeyToken)

  const isTs = lang === "typescript"
  const showLatitudeSdk = providerUsesLatitudeSdk(selectedProviderId)
  const latInstall = isTs ? getLatitudeTelemetryTsInstallCommand(tsPm) : getLatitudeTelemetryPyInstallCommand(pyPm)
  const sdkInstall = isTs
    ? getProviderSdkTsInstallCommand(selectedProviderId, tsPm)
    : getProviderSdkPyInstallCommand(selectedProviderId, pyPm)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Text.H5M>Install</Text.H5M>
        <Text.H5 color="foregroundMuted">
          Follow these instructions to integrate Latitude telemetry into an application that uses {providerDisplayName}.
        </Text.H5>
      </div>

      {showLatitudeSdk ? (
        <div className="flex flex-col gap-2">
          <Text.H5 color="foregroundMuted">Latitude SDK</Text.H5>
          <InstallCommandField
            command={latInstall}
            isTs={isTs}
            tsPm={tsPm}
            pyPm={pyPm}
            onSelectTs={setTsPm}
            onSelectPy={setPyPm}
          />
        </div>
      ) : null}
      {sdkInstall ? (
        <div className="flex flex-col gap-2">
          <Text.H5 color="foregroundMuted">Provider / framework packages</Text.H5>
          <InstallCommandField
            command={sdkInstall}
            isTs={isTs}
            tsPm={tsPm}
            pyPm={pyPm}
            onSelectTs={setTsPm}
            onSelectPy={setPyPm}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Text.H5M>Environment variables</Text.H5M>
        <Text.H5 color="foregroundMuted">
          Set these in your <code className="text-xs">.env</code> or runtime environment. Use a Latitude API key from
          organization settings.
        </Text.H5>
        <CodeBlock value={getEnvBlock(selectedProviderId, slugForSnippets, defaultApiKeyToken)} copyable />
      </div>

      {snippet ? (
        <div className="flex flex-col gap-2">
          <Text.H5M>Initialize and use</Text.H5M>
          <CodeBlock value={snippet} copyable />
        </div>
      ) : null}
    </div>
  )
}

function CodingMachineInstructions({
  agent,
  projectSlugForCopy,
  defaultApiKeyToken,
}: {
  readonly agent: CodingMachineAgentId
  readonly projectSlugForCopy: string
  readonly defaultApiKeyToken: string | null
}) {
  if (agent === "hermes") {
    return (
      <>
        <div className="flex flex-col gap-2">
          <Text.H5M>Install</Text.H5M>
          <Text.H5 color="foregroundMuted">{getCodingMachineInstallDescription(agent)}</Text.H5>
          <CodeBlock value={getCodingMachineTelemetryInstallCommand(agent)} copyable />
        </div>

        <div className="flex flex-col gap-2">
          <Text.H5M>Enable in `~/.hermes/config.yaml`</Text.H5M>
          <Text.H5 color="foregroundMuted">
            Add <code className="text-xs">latitude</code> under <code className="text-xs">plugins.enabled</code>. Don't
            use <code className="text-xs">hermes plugins enable</code> for pip-installed plugins.
          </Text.H5>
          <CodeBlock value={getHermesConfigYamlBlock()} copyable />
        </div>

        <div className="flex flex-col gap-2">
          <Text.H5M>Credentials in `~/.hermes/.env`</Text.H5M>
          <Text.H5 color="foregroundMuted">
            Hermes loads this file at startup. Send a message after setup and check Traces in Latitude.
          </Text.H5>
          <CodeBlock value={getHermesEnvBlock(projectSlugForCopy, defaultApiKeyToken)} copyable />
        </div>
      </>
    )
  }

  if (agent === "pi") {
    return (
      <>
        <div className="flex flex-col gap-2">
          <Text.H5M>Install</Text.H5M>
          <Text.H5 color="foregroundMuted">{getCodingMachineInstallDescription(agent)}</Text.H5>
          <CodeBlock value={getPiTelemetryInstallCommand(projectSlugForCopy, defaultApiKeyToken)} copyable />
        </div>

        <div className="flex flex-col gap-2">
          <Text.H5M>Restart and verify</Text.H5M>
          <Text.H5 color="foregroundMuted">
            Restart pi to load the extension, send a prompt that uses the model or a tool, then open Traces in
            Latitude. Your first trace should appear within a few seconds.
          </Text.H5>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Text.H5M>Install the plugin to your machine</Text.H5M>
        <Text.H5 color="foregroundMuted">{getCodingMachineInstallDescription(agent)}</Text.H5>
        <CodeBlock value={getCodingMachineTelemetryInstallCommand(agent)} copyable />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Text.H5M>Latitude API key</Text.H5M>
          <Text.H5 color="foregroundMuted">
            Default organization key (<code className="text-xs">{DEFAULT_API_KEY_NAME}</code>). Paste it when the
            installer asks for your API key.
          </Text.H5>
          {defaultApiKeyToken ? (
            <CodeBlock value={defaultApiKeyToken} copyable />
          ) : (
            <Text.H5 color="foregroundMuted">
              No key with that name yet. Create one under Settings → API Keys (you can name it{" "}
              <code className="text-xs">{DEFAULT_API_KEY_NAME}</code>).
            </Text.H5>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Text.H5M>Project slug</Text.H5M>
          <Text.H5 color="foregroundMuted">Use this value when the installer asks for your Latitude project.</Text.H5>
          {projectSlugForCopy ? (
            <CodeBlock value={projectSlugForCopy} copyable />
          ) : (
            <Text.H5 color="foregroundMuted">
              Project slug is not ready yet. Wait a moment or open project settings, then refresh this page.
            </Text.H5>
          )}
        </div>
      </div>
    </>
  )
}

// Cloudflare AI Gateway exports OTLP itself (no SDK); this panel shows the exporter config to paste.
function CloudflareAiGatewayInstructions({
  slug,
  defaultApiKeyToken,
}: {
  readonly slug: string
  readonly defaultApiKeyToken: string | null
}) {
  const config = cloudflareAiGatewayConfig(slug, defaultApiKeyToken)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Text.H5M>Cloudflare AI Gateway</Text.H5M>
        <Text.H5 color="foregroundMuted">
          Cloudflare AI Gateway exports OpenTelemetry spans for every request it proxies, so you don't need an SDK. In your
          gateway's <span className="font-medium">Settings → OpenTelemetry</span>, click{" "}
          <span className="font-medium">Add Otel Destination</span> and fill in the fields below.{" "}
          {defaultApiKeyToken ? (
            "The Authorization header is prefilled with your default Latitude API key."
          ) : (
            <>
              Replace <code className="text-xs">YOUR_API_KEY</code> in the Authorization header with a Latitude API key
              from Settings.
            </>
          )}
        </Text.H5>
      </div>

      <div className="flex flex-col gap-2">
        <Text.H5M>OTLP Traces Endpoint</Text.H5M>
        <CodeBlock value={config.endpoint} copyable />
      </div>

      <div className="flex flex-col gap-1">
        <Text.H5M>Content Type</Text.H5M>
        <Text.H5 color="foregroundMuted">
          Select <span className="font-medium">{config.contentType}</span>.
        </Text.H5>
      </div>

      <div className="flex flex-col gap-2">
        <Text.H5M>Custom Headers</Text.H5M>
        {config.headers.map((header) => (
          <div key={header.key} className="flex flex-col gap-1">
            <Text.H5 color="foregroundMuted">
              Header name: <code className="text-xs">{header.key}</code>
            </Text.H5>
            <CodeBlock value={header.value} copyable />
          </div>
        ))}
      </div>

      <Text.H5 color="foregroundMuted">
        See{" "}
        <a
          href="https://developers.cloudflare.com/ai-gateway/observability/otel-integration/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          Cloudflare's OpenTelemetry docs
        </a>{" "}
        for where to add the destination. Traces appear in Latitude within a few seconds of your next request.
      </Text.H5>
    </div>
  )
}

/**
 * Install / connect instructions shared between the onboarding telemetry step and the
 * Traces page empty-project experience. Renders the body only (no heading or footer) so
 * each host can frame it with its own surrounding copy and actions.
 */
export function TelemetryInstructions({ projectSlug }: { readonly projectSlug: string }) {
  const [telemetrySetupMode, setTelemetrySetupMode] = useState<TelemetrySetupMode>("coding-agent")
  const [selectedProvider, setSelectedProvider] = useState<ProviderEntry>(
    PROVIDER_ENTRIES[0] ?? { id: "claude-code", name: "Claude Code", icon: "claude-code" },
  )
  const [integrationPanel, setIntegrationPanel] = useState<IntegrationPanel>("typescript")
  const [otelExporterLanguage, setOtelExporterLanguage] = useState<OtelExporterLanguageId>("go")

  const { data: apiKeysList } = useApiKeysCollection()
  const defaultApiKeyToken = useMemo(() => {
    const keys = apiKeysList ?? []
    return keys.find((k) => k.name === DEFAULT_API_KEY_NAME)?.token ?? null
  }, [apiKeysList])

  const resolvedProjectSlug = projectSlug.trim()
  const slugForSnippets = resolvedProjectSlug || "your-project-slug"
  const projectSlugForCopy = resolvedProjectSlug

  const codingAgentPrompt = getCodingAgentTelemetryPrompt()

  const integrationTabOptions = useMemo(() => {
    if (isCodingMachineProvider(selectedProvider.id)) return []
    const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG[selectedProvider.id]
    const opts: Array<{ id: IntegrationPanel; label: string; icon: ReactNode }> = []
    if (cfg.supportsTypescript) {
      opts.push({ id: "typescript", label: "TypeScript", icon: <TypescriptIcon className="w-4 h-4" /> })
    }
    if (cfg.supportsPython) {
      opts.push({ id: "python", label: "Python", icon: <PythonIcon className="w-4 h-4" /> })
    }
    opts.push({ id: "opentelemetry", label: "OpenTelemetry", icon: <OpentelemetryIcon className="w-4 h-4" /> })
    return opts
  }, [selectedProvider.id])

  useLayoutEffect(() => {
    if (isCodingMachineProvider(selectedProvider.id)) return
    const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG[selectedProvider.id]
    setIntegrationPanel((current) => {
      if (current === "opentelemetry") return current
      if (current === "typescript" && !cfg.supportsTypescript) {
        return cfg.supportsPython ? "python" : "opentelemetry"
      }
      if (current === "python" && !cfg.supportsPython) {
        return cfg.supportsTypescript ? "typescript" : "opentelemetry"
      }
      return current
    })
  }, [selectedProvider.id])

  return (
    <>
      <div className="flex flex-col gap-3">
        <Text.H5M>Installation method</Text.H5M>
        <Tabs
          options={SETUP_MODE_TAB_OPTIONS}
          active={telemetrySetupMode}
          onSelect={(id) => setTelemetrySetupMode(id)}
          size="sm"
          variant="bordered"
        />
      </div>

      {telemetrySetupMode === "coding-agent" ? (
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Text.H5M>Prompt</Text.H5M>
            <Badge variant="accent">Recommended</Badge>
          </span>
          <Text.H5 color="foregroundMuted">
            Paste this into your coding agent's chat (Cursor, Claude Code, Codex, or anything else) to set up
            Latitude telemetry in your project.
          </Text.H5>
          <CodeBlock value={codingAgentPrompt} copyable wrapLines />
          <Text.H5 color="foregroundMuted">
            For the smoothest experience, install both the{" "}
            <a
              href="https://github.com/latitude-dev/skills"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              Latitude telemetry skill
            </a>{" "}
            and the{" "}
            <a
              href="https://docs.latitude.so/getting-started/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              Latitude MCP server
            </a>{" "}
            in your agent. The MCP lets the agent create projects and look up API keys directly; the skill wires tracing
            into your codebase.
          </Text.H5>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <Text.H5M>Select your provider</Text.H5M>
            <div className="flex flex-row flex-wrap gap-1">
              {PROVIDER_ENTRIES.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProvider(provider)}
                  className={`h-6 px-2 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${selectedProvider.id === provider.id ? "bg-primary-muted text-primary border-primary/30" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                >
                  <ProviderChipIcon provider={provider} />
                  <span>{provider.name}</span>
                </button>
              ))}
            </div>
          </div>

          <hr className="w-full border-0 border-t border-dashed border-border" />

          {isCodingMachineProvider(selectedProvider.id) ? (
            <CodingMachineInstructions
              agent={selectedProvider.id}
              projectSlugForCopy={projectSlugForCopy}
              defaultApiKeyToken={defaultApiKeyToken}
            />
          ) : (
            <>
              <Tabs
                options={integrationTabOptions}
                active={integrationPanel}
                onSelect={(id) => setIntegrationPanel(id as IntegrationPanel)}
              />

              {integrationPanel === "opentelemetry" ? (
                selectedProvider.id === "cloudflare-ai-gateway" ? (
                  <CloudflareAiGatewayInstructions slug={slugForSnippets} defaultApiKeyToken={defaultApiKeyToken} />
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Text.H5M>OpenTelemetry (OTLP)</Text.H5M>
                      <Text.H5 color="foregroundMuted">
                        Send a standard OTLP <code className="text-xs">ExportTraceServiceRequest</code> over HTTP.
                        Successful ingest returns <code className="text-xs">202</code> with{" "}
                        <code className="text-xs">{"{}"}</code>.
                      </Text.H5>
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed text-muted-foreground">
                      <div>
                        <span className="text-foreground">POST</span>{" "}
                        <span className="break-all">https://ingest.latitude.so/v1/traces</span>
                      </div>
                      <div>
                        <span className="text-foreground">Authorization:</span> Bearer{" "}
                        {defaultApiKeyToken ?? "<api-key>"}
                      </div>
                      <div>
                        <span className="text-foreground">X-Latitude-Project:</span> {slugForSnippets}
                      </div>
                      <div>
                        <span className="text-foreground">Content-Type:</span> application/json or
                        application/x-protobuf
                      </div>
                    </div>

                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col gap-2">
                        <Text.H5M>Verify with cURL</Text.H5M>
                        <Text.H5 color="foregroundMuted">
                          POST a minimal OTLP JSON trace.{" "}
                          {defaultApiKeyToken ? (
                            "The authorization header is prefilled with your default Latitude API key."
                          ) : (
                            <>
                              Replace <code className="text-xs">YOUR_API_KEY</code> with a Latitude API key from
                              Settings.
                            </>
                          )}{" "}
                          Expect <code className="text-xs">202</code> and an empty JSON body on success. Project slug is
                          prefilled on the header line.
                        </Text.H5>
                        <CodeBlock value={getOtelCurlVerifySnippet(slugForSnippets, defaultApiKeyToken)} copyable />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Text.H5M>Language examples</Text.H5M>
                        <Text.H5 color="foregroundMuted">Configure an OTLP HTTP exporter in your stack.</Text.H5>
                        <OtelExporterLanguageChips active={otelExporterLanguage} onSelect={setOtelExporterLanguage} />
                        <CodeBlock
                          value={getOtelExporterLanguageSnippet(
                            otelExporterLanguage,
                            slugForSnippets,
                            defaultApiKeyToken,
                          )}
                          copyable
                        />
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <SdkIntegrationInstructions
                  selectedProviderId={selectedProvider.id}
                  providerDisplayName={selectedProvider.name}
                  lang={integrationPanel === "typescript" ? "typescript" : "python"}
                  slugForSnippets={slugForSnippets}
                  defaultApiKeyToken={defaultApiKeyToken}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
