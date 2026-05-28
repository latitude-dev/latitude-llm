import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import { Button, CodeBlock, CopyButton, ProviderIcon, Tabs, Text } from "@repo/ui"
import { Bot, Braces, FileCode2, Radio, Terminal } from "lucide-react"
import type { ReactNode } from "react"
import { lazy, Suspense, useLayoutEffect, useMemo, useState } from "react"
import { useApiKeysCollection } from "../../../../../../../domains/api-keys/api-keys.collection.ts"
import {
  type CodingMachineAgentId,
  getCodingAgentTelemetryPrompt,
  getCodingMachineInstallDescription,
  getCodingMachineTelemetryInstallCommand,
  getEnvBlock,
  getLatitudeTelemetryPyInstallCommand,
  getLatitudeTelemetryTsInstallCommand,
  getOnboardingSnippet,
  getOtelCurlVerifySnippet,
  getOtelExporterLanguageSnippet,
  getProviderSdkPyInstallCommand,
  getProviderSdkTsInstallCommand,
  ONBOARDING_PROVIDER_SNIPPET_CONFIG,
  type OnboardingProviderId,
  OTEL_EXPORTER_LANGUAGE_OPTIONS,
  type OtelExporterLanguageId,
  PY_PACKAGE_MANAGERS,
  type PyPackageManager,
  type SdkLanguage,
  TS_PACKAGE_MANAGERS,
  type TsPackageManager,
} from "../../onboarding-integration-snippets.ts"
import { ONBOARDING_CLAUDE_CODE_LOGO_SRC, ONBOARDING_OPENCLAW_LOGO_SRC } from "../assets.ts"
import { TraceTail } from "../mocks/trace-tail.tsx"
import type { StackChoice } from "./stack-step.tsx"

type TelemetrySetupMode = "coding-agent" | "manual"
type IntegrationPanel = "typescript" | "python" | "opentelemetry"

const SETUP_MODE_TAB_OPTIONS = [
  { id: "coding-agent" as const, label: "Coding agent", icon: <Bot className="h-4 w-4" /> },
  { id: "manual" as const, label: "Manual", icon: <Terminal className="h-4 w-4" /> },
] as const satisfies ReadonlyArray<{ id: TelemetrySetupMode; label: string; icon: ReactNode }>

function OnboardingCodingAgentTabIcon({ src }: { readonly src: string }) {
  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      decoding="async"
      className="h-4 w-4 shrink-0 rounded-sm object-contain"
      aria-hidden
    />
  )
}

const CODING_MACHINE_AGENT_TAB_OPTIONS = [
  {
    id: "claude-code" as const,
    label: "Claude Code",
    icon: <OnboardingCodingAgentTabIcon src={ONBOARDING_CLAUDE_CODE_LOGO_SRC} />,
  },
  {
    id: "openclaw" as const,
    label: "OpenClaw",
    icon: <OnboardingCodingAgentTabIcon src={ONBOARDING_OPENCLAW_LOGO_SRC} />,
  },
] as const satisfies ReadonlyArray<{ id: CodingMachineAgentId; label: string; icon: ReactNode }>

interface ProviderEntry {
  readonly id: OnboardingProviderId
  readonly name: string
  readonly icon: string
}

/** Order matches docs.latitude.so telemetry providers, then frameworks (see /telemetry/overview). */
const PROVIDER_ENTRIES: ReadonlyArray<ProviderEntry> = [
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
  { id: "litellm", name: "LiteLLM", icon: "generic" },
  { id: "replicate", name: "Replicate", icon: "generic" },
  { id: "sagemaker", name: "SageMaker", icon: "amazon-bedrock" },
  { id: "watsonx", name: "watsonx.ai", icon: "generic" },
  { id: "aleph-alpha", name: "Aleph Alpha", icon: "generic" },
  { id: "transformers", name: "Transformers", icon: "huggingface" },
  { id: "vercel-ai-sdk", name: "Vercel AI SDK", icon: "vercel" },
  { id: "langchain", name: "LangChain", icon: "generic" },
  { id: "llamaindex", name: "LlamaIndex", icon: "generic" },
]

const OnboardingWaitingLottie = lazy(() => import("../../onboarding-waiting-lottie.tsx"))

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

export function Left({
  stackChoice,
  traceReceived,
  projectSlug,
  onBack,
  onSkip,
}: {
  readonly stackChoice: StackChoice | null
  readonly traceReceived: boolean
  readonly projectSlug: string
  readonly onBack: () => void
  readonly onSkip: () => void
}) {
  const [telemetrySetupMode, setTelemetrySetupMode] = useState<TelemetrySetupMode>("coding-agent")
  const [selectedProvider, setSelectedProvider] = useState<ProviderEntry>(
    PROVIDER_ENTRIES[0] ?? { id: "openai", name: "OpenAI", icon: "openai" },
  )
  const [integrationPanel, setIntegrationPanel] = useState<IntegrationPanel>("typescript")
  const [otelExporterLanguage, setOtelExporterLanguage] = useState<OtelExporterLanguageId>("go")
  const [codingMachineAgent, setCodingMachineAgent] = useState<CodingMachineAgentId>("claude-code")

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
    const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG[selectedProvider.id]
    const opts: Array<{ id: IntegrationPanel; label: string; icon: ReactNode }> = []
    if (cfg.supportsTypescript) {
      opts.push({ id: "typescript", label: "TypeScript", icon: <Braces className="w-4 h-4" /> })
    }
    if (cfg.supportsPython) {
      opts.push({ id: "python", label: "Python", icon: <FileCode2 className="w-4 h-4" /> })
    }
    opts.push({ id: "opentelemetry", label: "OpenTelemetry", icon: <Radio className="w-4 h-4" /> })
    return opts
  }, [selectedProvider.id])

  useLayoutEffect(() => {
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

  if (stackChoice === "production-agent") {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <div className="flex w-full flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="h-8 w-8 overflow-hidden rounded-md">
              <Suspense fallback={<div className="h-8 w-8 shrink-0" aria-hidden />}>
                <OnboardingWaitingLottie />
              </Suspense>
            </div>
            <div className="flex flex-col gap-2">
              <Text.H2 weight="medium">
                {traceReceived ? "Trace received. Redirecting…" : "Set up your first project"}
              </Text.H2>
              <Text.H4 color="foregroundMuted">
                {traceReceived ? "Taking you to your traces…" : "Initiate your first project on Latitude"}
              </Text.H4>
            </div>
          </div>

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
              <Text.H5M>Prompt</Text.H5M>
              <Text.H5 color="foregroundMuted">
                Paste this into the chat with your coding agent — Cursor, Claude Code, Codex, or any other — to set up
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
                in your agent. The MCP lets the agent create projects and look up API keys directly; the skill wires
                tracing into your codebase.
              </Text.H5>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <Text.H5M>Select your LLM provider</Text.H5M>
                <div className="flex flex-row flex-wrap gap-1">
                  {PROVIDER_ENTRIES.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setSelectedProvider(provider)}
                      className={`h-6 px-2 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${selectedProvider.id === provider.id ? "bg-primary-muted text-primary border-primary/30" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                    >
                      <ProviderIcon provider={provider.icon} size="xs" />
                      <span>{provider.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <hr className="w-full border-0 border-t border-dashed border-border" />

              <Tabs
                options={integrationTabOptions}
                active={integrationPanel}
                onSelect={(id) => setIntegrationPanel(id as IntegrationPanel)}
              />

              {integrationPanel === "opentelemetry" ? (
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
                      <span className="text-foreground">Authorization:</span> Bearer {defaultApiKeyToken ?? "<api-key>"}
                    </div>
                    <div>
                      <span className="text-foreground">X-Latitude-Project:</span> {slugForSnippets}
                    </div>
                    <div>
                      <span className="text-foreground">Content-Type:</span> application/json or application/x-protobuf
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
                            Replace <code className="text-xs">YOUR_API_KEY</code> with a Latitude API key from Settings.
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

          <div className="flex flex-row flex-wrap items-center gap-3">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // coding-agent-machine
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="h-8 w-8 overflow-hidden rounded-md">
            <Suspense fallback={<div className="h-8 w-8 shrink-0" aria-hidden />}>
              <OnboardingWaitingLottie />
            </Suspense>
          </div>
          <div className="flex flex-col gap-2">
            <Text.H2 weight="medium">{traceReceived ? "Trace received. Redirecting…" : "Install the plugin"}</Text.H2>
            <Text.H4 color="foregroundMuted">
              {traceReceived ? "Taking you to your traces…" : "Set up Latitude telemetry for your agent in one command"}
            </Text.H4>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Text.H5M>Select your agent</Text.H5M>
          <Tabs
            options={CODING_MACHINE_AGENT_TAB_OPTIONS}
            active={codingMachineAgent}
            onSelect={(id) => setCodingMachineAgent(id)}
            size="sm"
            variant="bordered"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Text.H5M>Install the plugin to your machine</Text.H5M>
          <Text.H5 color="foregroundMuted">{getCodingMachineInstallDescription(codingMachineAgent)}</Text.H5>
          <CodeBlock value={getCodingMachineTelemetryInstallCommand(codingMachineAgent)} copyable />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Text.H5M>Latitude API key</Text.H5M>
            <Text.H5 color="foregroundMuted">
              Default organization key (<code className="text-xs">{DEFAULT_API_KEY_NAME}</code>) — paste when the
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

        <div className="flex flex-row flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Right({ traceReceived }: { readonly traceReceived: boolean }) {
  return <TraceTail traceReceived={traceReceived} />
}
