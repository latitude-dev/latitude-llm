import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import { Button, Checkbox, CodeBlock, CopyButton, ProviderIcon, Tabs, Text, useMountEffect } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import type { LucideIcon } from "lucide-react"
import {
  Bot,
  Braces,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Radio,
  SquareDashedBottomCode,
  Terminal,
} from "lucide-react"
import { lazy, type ReactNode, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useApiKeysCollection } from "../../../../../domains/api-keys/api-keys.collection.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { countTracesByProject } from "../../../../../domains/traces/traces.functions.ts"
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
} from "./onboarding-integration-snippets.ts"

type OnboardingRole = "engineer" | "data-ai-ml" | "product-manager" | "founder" | "other"
type OnboardingStep = "role" | "stack" | "telemetry"
type StackChoice = "coding-agent-machine" | "production-agent"
type TelemetrySetupMode = "coding-agent" | "manual"
type IntegrationPanel = "typescript" | "python" | "opentelemetry"

const SETUP_MODE_TAB_OPTIONS = [
  { id: "coding-agent" as const, label: "Coding agent", icon: <Bot className="h-4 w-4" /> },
  { id: "manual" as const, label: "Manual", icon: <Terminal className="h-4 w-4" /> },
] as const satisfies ReadonlyArray<{ id: TelemetrySetupMode; label: string; icon: ReactNode }>

const ONBOARDING_CLAUDE_CODE_LOGO_SRC = "/onboarding/claude-code-logo.png"
const ONBOARDING_OPENCLAW_LOGO_SRC = "/onboarding/openclaw-logo.png"

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

const STACK_CHOICE_OPTIONS: ReadonlyArray<{
  readonly id: StackChoice
  readonly title: string
  readonly description: string
  readonly leading:
    | { readonly type: "logo"; readonly src: string }
    | { readonly type: "icon"; readonly Icon: LucideIcon }
}> = [
  {
    id: "coding-agent-machine",
    title: "Coding agent",
    description: "Receive traces and monitor issues in your Claude Code or OpenClaw agent",
    leading: { type: "logo", src: ONBOARDING_CLAUDE_CODE_LOGO_SRC },
  },
  {
    id: "production-agent",
    title: "Production agent traces",
    description: "Set up Latitude directly in your project running on any available provider",
    leading: { type: "icon", Icon: SquareDashedBottomCode },
  },
]

interface ProviderEntry {
  readonly id: OnboardingProviderId
  readonly name: string
  readonly icon: string
}

const ROLE_OPTIONS: ReadonlyArray<{
  readonly id: OnboardingRole
  readonly title: string
  readonly description: string
}> = [
  { id: "engineer", title: "Engineer", description: "I'll set up the SDK and own the integration" },
  {
    id: "data-ai-ml",
    title: "Data / AI / ML",
    description: "I evaluate model quality — I review traces, annotate outputs, and track scores over time",
  },
  {
    id: "product-manager",
    title: "Product manager",
    description: "I track how our AI features are performing and spot regressions",
  },
  {
    id: "founder",
    title: "Founder",
    description: "I need visibility into what our AI is doing and whether it's working as intended",
  },
  { id: "other", title: "Other", description: "I'm something else" },
]

const ROLE_MOCKUPS: Record<OnboardingRole, string> = {
  engineer: "/onboarding/role-engineer.png",
  "data-ai-ml": "/onboarding/issues.png",
  "product-manager": "/onboarding/home.png",
  founder: "/onboarding/home.png",
  other: "/onboarding/traces.png",
}

/** Right-panel headline for each role (step 1). */
const ROLE_PANEL_TITLES: Record<OnboardingRole, string> = {
  engineer: "Instrument once and start seeing live traces in Latitude right away",
  "data-ai-ml": "Label traces, watch trends, detect outliers & monitor issues within one platform",
  "product-manager": "Keep track of latency, cost, and errors in collaborative environment",
  founder: "Review the entire pipeline: cost, failures, behaviour and team contributions",
  other: "Discover the most advanced issue detection system on the market",
}

const WAITING_GALLERY: ReadonlyArray<{ readonly title: string; readonly description: string; readonly image: string }> =
  [
    {
      title: "Live traces coming in",
      description: "As soon as we detect your first trace, you will start getting comprehensive insights",
      image: "/onboarding/traces.png",
    },
    {
      title: "Debug responses with context",
      description: "Inspect model calls, timing, costs and session metadata in one place",
      image: "/onboarding/home.png",
    },
    {
      title: "Detect issues automatically",
      description: "Once the telemetry is set up, Latitude will start monitoring your product for common issues",
      image: "/onboarding/issues.png",
    },
  ]

const ONBOARDING_IMAGE_DIMENSIONS: Record<
  string,
  {
    readonly width: number
    readonly height: number
  }
> = {
  "/onboarding/role-engineer.png": { width: 1024, height: 567 },
  "/onboarding/home.png": { width: 1024, height: 580 },
  "/onboarding/issues.png": { width: 1024, height: 579 },
  "/onboarding/traces.png": { width: 1024, height: 579 },
}

/** Full-width preview (matches step-2 gallery): uses the whole right pane width, natural image height. */
function OnboardingPreviewImage({
  src,
  alt,
  width,
  height,
}: {
  readonly src: string
  readonly alt: string
  readonly width: number
  readonly height: number
}) {
  return (
    <div className="w-full overflow-hidden rounded-xl border-4 border-border bg-card shadow-xl">
      <img src={src} alt={alt} width={width} height={height} className="block h-auto w-full max-w-full" />
    </div>
  )
}

const OnboardingWaitingLottie = lazy(() => import("./onboarding-waiting-lottie.tsx"))

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

export function OnboardingFlow({
  projectId,
  projectSlug,
  onOpenProjectTraces,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly onOpenProjectTraces: (projectId: string) => Promise<void>
}) {
  const [step, setStep] = useState<OnboardingStep>("role")
  const [role, setRole] = useState<OnboardingRole>("engineer")
  const [stackChoice, setStackChoice] = useState<StackChoice | null>(null)
  const [codingMachineAgent, setCodingMachineAgent] = useState<CodingMachineAgentId>("claude-code")
  const [selectedProvider, setSelectedProvider] = useState<ProviderEntry>(
    PROVIDER_ENTRIES[0] ?? { id: "openai", name: "OpenAI", icon: "openai" },
  )
  const [telemetrySetupMode, setTelemetrySetupMode] = useState<TelemetrySetupMode>("coding-agent")
  const [integrationPanel, setIntegrationPanel] = useState<IntegrationPanel>("typescript")
  const [otelExporterLanguage, setOtelExporterLanguage] = useState<OtelExporterLanguageId>("go")

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, projectId)).findOne(),
    [projectId],
  )
  const { data: apiKeysList } = useApiKeysCollection()

  const resolvedProjectSlug = project?.slug?.trim() || projectSlug.trim()
  const slugForSnippets = resolvedProjectSlug || "your-project-slug"
  const projectSlugForCopy = resolvedProjectSlug

  const defaultApiKeyToken = useMemo(() => {
    const keys = apiKeysList ?? []
    return keys.find((k) => k.name === DEFAULT_API_KEY_NAME)?.token ?? null
  }, [apiKeysList])

  const codingAgentPrompt = useMemo(
    () =>
      getCodingAgentTelemetryPrompt({
        apiKey: defaultApiKeyToken,
        projectSlug: slugForSnippets,
      }),
    [defaultApiKeyToken, slugForSnippets],
  )

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

  const [galleryIndex, setGalleryIndex] = useState(0)
  const [traceReceived, setTraceReceived] = useState(false)
  const pollTimeoutRef = useRef<number | undefined>(undefined)
  const redirectTimeoutRef = useRef<number | undefined>(undefined)
  const projectIdRef = useRef(projectId)
  const onOpenProjectTracesRef = useRef(onOpenProjectTraces)
  projectIdRef.current = projectId
  onOpenProjectTracesRef.current = onOpenProjectTraces

  useMountEffect(() => {
    let cancelled = false

    const clearTimers = () => {
      if (pollTimeoutRef.current !== undefined) {
        window.clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = undefined
      }
      if (redirectTimeoutRef.current !== undefined) {
        window.clearTimeout(redirectTimeoutRef.current)
        redirectTimeoutRef.current = undefined
      }
    }

    const poll = async () => {
      if (cancelled) return
      try {
        const count = await countTracesByProject({
          data: { projectId: projectIdRef.current },
        })
        if (cancelled) return
        if (count > 0) {
          setTraceReceived(true)
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) void onOpenProjectTracesRef.current(projectIdRef.current)
          }, 3000)
          return
        }
      } finally {
        if (!cancelled && redirectTimeoutRef.current === undefined) {
          pollTimeoutRef.current = window.setTimeout(() => void poll(), 3000)
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      clearTimers()
    }
  })

  const galleryItemIndex = WAITING_GALLERY.length === 0 ? 0 : galleryIndex % WAITING_GALLERY.length
  const activeGalleryItem = WAITING_GALLERY[galleryItemIndex] ?? {
    title: "",
    description: "",
    image: "",
  }
  const roleImageSrc = ROLE_MOCKUPS[role]
  const roleImageDimensions = ONBOARDING_IMAGE_DIMENSIONS[roleImageSrc] ?? { width: 1024, height: 579 }
  const galleryImageDimensions = ONBOARDING_IMAGE_DIMENSIONS[activeGalleryItem.image] ?? { width: 1024, height: 579 }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-1/2 min-w-0 flex-col overflow-y-auto overscroll-y-contain border-r border-border px-24 pt-24 pb-32 [scrollbar-gutter:stable]">
        {step === "role" ? (
          <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
            <div className="flex w-full flex-col gap-8">
              <div className="flex flex-col gap-4">
                <div className="h-8 w-8">
                  <img src="/favicon.svg" alt="Latitude" className="h-8 w-8" />
                </div>
                <div className="flex flex-col gap-2">
                  <Text.H2 weight="medium">Tell us about yourself</Text.H2>
                  <Text.H4 color="foregroundMuted">Help Latitude personalize your experience.</Text.H4>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {ROLE_OPTIONS.map((option) => {
                  const selected = role === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`w-full rounded-lg border p-4 flex flex-row items-start justify-between text-left ${selected ? "border-primary bg-accent/20" : "border-border"}`}
                      onClick={() => setRole(option.id)}
                    >
                      <div className="flex flex-col gap-1">
                        <Text.H4 weight="medium">{option.title}</Text.H4>
                        <Text.H5 color="foregroundMuted">{option.description}</Text.H5>
                      </div>
                      <div className="pt-1">
                        <Checkbox checked={selected} />
                      </div>
                    </button>
                  )
                })}
              </div>
              <div>
                <Button onClick={() => setStep("stack")}>Next</Button>
              </div>
            </div>
          </div>
        ) : step === "stack" ? (
          <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
            <div className="flex w-full flex-col gap-8">
              <div className="flex flex-col gap-4">
                <div className="h-8 w-8">
                  <img src="/favicon.svg" alt="Latitude" className="h-8 w-8" />
                </div>
                <div className="flex flex-col gap-2">
                  <Text.H2 weight="medium">Select your stack</Text.H2>
                  <Text.H4 color="foregroundMuted">What do you want to monitor with Latitude?</Text.H4>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {STACK_CHOICE_OPTIONS.map((option) => {
                  const selected = stackChoice === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`flex w-full flex-row items-start justify-between gap-4 rounded-lg border p-4 text-left ${selected ? "border-primary bg-accent/20" : "border-border"}`}
                      onClick={() => setStackChoice(option.id)}
                    >
                      <div className="flex min-w-0 flex-1 flex-row items-start gap-4">
                        <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-lg border border-border bg-card p-2">
                          {option.leading.type === "logo" ? (
                            <img
                              src={option.leading.src}
                              alt=""
                              decoding="async"
                              className="max-h-12 w-full max-w-full object-contain"
                              aria-hidden
                            />
                          ) : (
                            <option.leading.Icon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                          <Text.H4 weight="medium">{option.title}</Text.H4>
                          <Text.H5 color="foregroundMuted">{option.description}</Text.H5>
                        </div>
                      </div>
                      <div className="pt-1">
                        <Checkbox checked={selected} />
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-row flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setStep("role")}>
                  Back
                </Button>
                <Button
                  disabled={stackChoice === null}
                  onClick={() => {
                    if (stackChoice === null) return
                    setStep("telemetry")
                  }}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        ) : stackChoice === "production-agent" ? (
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
                    Paste this into the chat with your coding agent — Cursor, Claude Code, Codex, or any other — to set
                    up Latitude telemetry in your project.
                  </Text.H5>
                  <CodeBlock value={codingAgentPrompt} copyable wrapLines={false} />
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
                            Expect <code className="text-xs">202</code> and an empty JSON body on success. Project slug
                            is prefilled on the header line.
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
                <Button variant="outline" onClick={() => setStep("stack")}>
                  Back
                </Button>
                <Button variant="ghost" onClick={() => void onOpenProjectTraces(projectId)}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        ) : (
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
                    {traceReceived ? "Trace received. Redirecting…" : "Install the plugin"}
                  </Text.H2>
                  <Text.H4 color="foregroundMuted">
                    {traceReceived
                      ? "Taking you to your traces…"
                      : "Set up Latitude telemetry for your agent in one command"}
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
                  <Text.H5 color="foregroundMuted">
                    Use this value when the installer asks for your Latitude project.
                  </Text.H5>
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
                <Button variant="outline" onClick={() => setStep("stack")}>
                  Back
                </Button>
                <Button variant="ghost" onClick={() => void onOpenProjectTraces(projectId)}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-full min-h-0 w-1/2 min-w-0 shrink-0 flex-col overflow-hidden bg-secondary">
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-24 [scrollbar-gutter:stable]">
          {step === "role" ? (
            <div className="flex h-fit w-full flex-col items-center gap-4">
              <OnboardingPreviewImage
                src={roleImageSrc}
                alt={`${role} preview`}
                width={roleImageDimensions.width}
                height={roleImageDimensions.height}
              />
              <Text.H5 className="w-full max-w-[591px]" color="foregroundMuted" align="center">
                {ROLE_PANEL_TITLES[role]}
              </Text.H5>
            </div>
          ) : (
            <div className="flex h-fit w-full flex-col items-start">
              <div className="flex w-full max-w-[591px] flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <Text.H5M>{activeGalleryItem.title}</Text.H5M>
                  <Text.H6 color="foregroundMuted">{activeGalleryItem.description}</Text.H6>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setGalleryIndex((c) => (c === 0 ? WAITING_GALLERY.length - 1 : c - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setGalleryIndex((c) => (c + 1) % WAITING_GALLERY.length)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-10 w-full">
                <OnboardingPreviewImage
                  src={activeGalleryItem.image}
                  alt={activeGalleryItem.title}
                  width={galleryImageDimensions.width}
                  height={galleryImageDimensions.height}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
