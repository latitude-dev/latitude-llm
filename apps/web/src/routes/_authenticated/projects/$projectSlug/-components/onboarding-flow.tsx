import { Button, Checkbox, CodeBlock, ProviderIcon, Tabs, Text, useMountEffect } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { Bot, Braces, ChevronLeft, ChevronRight, FileCode2, Radio, Terminal } from "lucide-react"
import { lazy, type ReactNode, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { countTracesByProject } from "../../../../../domains/traces/traces.functions.ts"
import {
  getCodingAgentTelemetryPrompt,
  getEnvBlock,
  getInstallLine,
  getOnboardingSnippet,
  ONBOARDING_PROVIDER_SNIPPET_CONFIG,
  type OnboardingProviderId,
  type SdkLanguage,
} from "./onboarding-integration-snippets.ts"

type OnboardingRole = "engineer" | "data-ai-ml" | "product-manager" | "founder" | "other"
type TelemetrySetupMode = "coding-agent" | "manual"
type IntegrationPanel = "typescript" | "python" | "opentelemetry"

const SETUP_MODE_TAB_OPTIONS = [
  { id: "coding-agent" as const, label: "Coding agent", icon: <Bot className="h-4 w-4" /> },
  { id: "manual" as const, label: "Manual", icon: <Terminal className="h-4 w-4" /> },
] as const satisfies ReadonlyArray<{ id: TelemetrySetupMode; label: string; icon: ReactNode }>

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

/** Order matches `packages/telemetry` on `main`: TS SDK + Python examples. */
const PROVIDER_ENTRIES: ReadonlyArray<ProviderEntry> = [
  { id: "openai", name: "OpenAI", icon: "openai" },
  { id: "azure-openai", name: "Azure OpenAI", icon: "azure" },
  { id: "anthropic", name: "Anthropic", icon: "anthropic" },
  { id: "gemini", name: "Gemini (Google GenAI)", icon: "google" },
  { id: "bedrock", name: "Amazon Bedrock", icon: "amazon-bedrock" },
  { id: "vertexai", name: "Vertex AI", icon: "google-vertex" },
  { id: "cohere", name: "Cohere", icon: "cohere" },
  { id: "togetherai", name: "Together AI", icon: "togetherai" },
  { id: "aiplatform", name: "Google AI Platform", icon: "google" },
  { id: "langchain", name: "LangChain", icon: "generic" },
  { id: "llamaindex", name: "LlamaIndex", icon: "generic" },
  { id: "groq", name: "Groq", icon: "groq" },
  { id: "mistral", name: "Mistral", icon: "mistral" },
  { id: "litellm", name: "LiteLLM", icon: "generic" },
  { id: "ollama", name: "Ollama", icon: "llama" },
  { id: "replicate", name: "Replicate", icon: "huggingface" },
  { id: "sagemaker", name: "AWS SageMaker", icon: "amazon-bedrock" },
  { id: "watsonx", name: "IBM watsonx.ai", icon: "generic" },
  { id: "aleph-alpha", name: "Aleph Alpha", icon: "generic" },
  { id: "transformers", name: "Hugging Face Transformers", icon: "huggingface" },
  { id: "crewai", name: "CrewAI", icon: "generic" },
  { id: "haystack", name: "Haystack", icon: "generic" },
  { id: "dspy", name: "DSPy", icon: "generic" },
]

function SdkIntegrationInstructions({
  selectedProviderId,
  lang,
  slugForSnippets,
}: {
  readonly selectedProviderId: OnboardingProviderId
  readonly lang: SdkLanguage
  readonly slugForSnippets: string
}) {
  const install = getInstallLine(selectedProviderId, lang)
  const snippet = getOnboardingSnippet(selectedProviderId, lang, slugForSnippets)

  return (
    <>
      <div className="flex flex-col gap-2">
        <Text.H5M>Install</Text.H5M>
        {install ? (
          <CodeBlock value={install} copyable />
        ) : (
          <Text.H5 color="foregroundMuted">
            No install line is configured for this language. See <code className="text-xs">packages/telemetry</code> on
            the main branch.
          </Text.H5>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Text.H5M>Environment variables</Text.H5M>
        <Text.H5 color="foregroundMuted">
          Set these in your <code className="text-xs">.env</code> or runtime environment. Use a Latitude API key from
          organization settings.
        </Text.H5>
        <CodeBlock value={getEnvBlock(selectedProviderId, "sdk", slugForSnippets)} copyable />
      </div>

      {snippet ? (
        <div className="flex flex-col gap-2">
          <Text.H5M>Minimal integration</Text.H5M>
          <CodeBlock value={snippet} copyable />
        </div>
      ) : null}
    </>
  )
}

export function OnboardingFlow({
  projectId,
  onOpenProjectTraces,
}: {
  readonly projectId: string
  readonly onOpenProjectTraces: (projectId: string) => Promise<void>
}) {
  const [step, setStep] = useState<"role" | "provider">("role")
  const [role, setRole] = useState<OnboardingRole>("engineer")
  const [selectedProvider, setSelectedProvider] = useState<ProviderEntry>(
    PROVIDER_ENTRIES[0] ?? { id: "openai", name: "OpenAI", icon: "openai" },
  )
  const [telemetrySetupMode, setTelemetrySetupMode] = useState<TelemetrySetupMode>("coding-agent")
  const [integrationPanel, setIntegrationPanel] = useState<IntegrationPanel>("typescript")

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, projectId)).findOne(),
    [projectId],
  )
  const slugForSnippets = project?.slug?.trim() ? project.slug : "your-project-slug"

  const codingAgentPrompt = useMemo(
    () =>
      getCodingAgentTelemetryPrompt({
        projectId,
        projectSlug: slugForSnippets,
      }),
    [projectId, slugForSnippets],
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
        const count = await countTracesByProject({ data: { projectId } })
        if (cancelled) return
        if (count > 0) {
          setTraceReceived(true)
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) void onOpenProjectTraces(projectId)
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
      <div className="flex h-full min-h-0 w-1/2 min-w-0 flex-col overflow-y-auto overscroll-y-contain border-r border-border px-24 pt-24 pb-32">
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
                <Button onClick={() => setStep("provider")}>Next</Button>
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
                    {traceReceived ? "Trace received. Redirecting…" : "Waiting for traces"}
                  </Text.H2>
                  <Text.H4 color="foregroundMuted">Set up Latitude in your project and start sending traces</Text.H4>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Text.H5M>Set up telemetry</Text.H5M>
                <Tabs
                  options={SETUP_MODE_TAB_OPTIONS}
                  active={telemetrySetupMode}
                  onSelect={(id) => setTelemetrySetupMode(id)}
                />
              </div>

              {telemetrySetupMode === "coding-agent" ? (
                <div className="flex flex-col gap-2">
                  <Text.H5M>Prompt</Text.H5M>
                  <Text.H5 color="foregroundMuted">Send this prompt to your coding agent of choice.</Text.H5>
                  <CodeBlock value={codingAgentPrompt} copyable />
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
                    <div className="flex flex-col gap-2">
                      <Text.H5M>Environment variables</Text.H5M>
                      <Text.H5 color="foregroundMuted">
                        Use the Latitude SDK when possible. For an existing OpenTelemetry setup, add the Latitude span
                        processor or point your OTLP exporter at Latitude ingest—see{" "}
                        <code className="text-xs">packages/telemetry</code> on the main branch for patterns.
                      </Text.H5>
                      <CodeBlock value={getEnvBlock(selectedProvider.id, "opentelemetry", slugForSnippets)} copyable />
                    </div>
                  ) : (
                    <SdkIntegrationInstructions
                      selectedProviderId={selectedProvider.id}
                      lang={integrationPanel === "typescript" ? "typescript" : "python"}
                      slugForSnippets={slugForSnippets}
                    />
                  )}
                </>
              )}

              <div className="flex flex-row flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setStep("role")}>
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
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto p-24">
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
