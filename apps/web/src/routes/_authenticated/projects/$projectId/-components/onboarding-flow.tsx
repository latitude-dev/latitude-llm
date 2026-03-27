import { Button, Checkbox, CodeBlock, ProviderIcon, Tabs, Text, useMountEffect } from "@repo/ui"
import { ChevronLeft, ChevronRight, DoorOpen, ListTree } from "lucide-react"
import { type ElementType, useRef, useState } from "react"
import { countTracesByProject } from "../../../../../domains/traces/traces.functions.ts"

type OnboardingRole = "engineer" | "data-ai-ml" | "product-manager" | "founder" | "other"
type IntegrationMode = "sdk" | "opentelemetry"

interface ProviderDefinition {
  readonly name: string
  readonly icon: string
  readonly sdkInstall: string
  readonly sdkEnv: string
  readonly otelSetup: string
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
  "data-ai-ml": "/onboarding/role-data.png",
  "product-manager": "/onboarding/role-product.png",
  founder: "/onboarding/role-product.png",
  other: "/onboarding/role-product.png",
}

const ROLE_TESTIMONIALS: Record<
  OnboardingRole,
  { readonly quote: string; readonly name: string; readonly title: string }
> = {
  engineer: {
    quote:
      "Latitude ties LLM calls to tools and spans in one place—we cut debug time without spelunking logs or reproducing flaky sessions for our team now.",
    name: "Alex Chen",
    title: "Staff Engineer @ Northwind Labs",
  },
  "data-ai-ml": {
    quote:
      "We label runs in Latitude and watch quality trend—drift surfaces early, not in quarterly reviews after the wrong fix already shipped broadly now.",
    name: "Jordan Okonkwo",
    title: "ML Lead @ Riverstone Analytics",
  },
  "product-manager": {
    quote:
      "Latitude shows latency, cost, and errors for our AI in prod—we catch regressions before customers hit support or see quality slipping in-app now.",
    name: "Sam Rivera",
    title: "Product Lead @ Harbor Apps",
  },
  founder: {
    quote:
      "I see AI cost, failures, and whether behavior matches our pitch—Latitude puts spend, reliability, and risk in one dashboard for leadership teams.",
    name: "Casey Park",
    title: "CEO @ Lantern Systems",
  },
  other: {
    quote:
      "We wanted one LLM observability home—Latitude unifies traces, spend, and failures so we stop juggling five tools and three dashboards daily here.",
    name: "Riley Brooks",
    title: "Head of Ops @ Meridian Co.",
  },
}

const WAITING_GALLERY: ReadonlyArray<{ readonly title: string; readonly description: string; readonly image: string }> =
  [
    {
      title: "Live traces coming in",
      description: "As soon as we detect your first trace, we will open the project traces tab automatically.",
      image: "/onboarding/discover.png",
    },
    {
      title: "Debug responses with context",
      description: "Inspect model calls, timing, costs and user/session metadata in one place.",
      image: "/onboarding/observe.png",
    },
    {
      title: "Track product-level behavior",
      description: "Use role-specific views to monitor quality and catch regressions quickly.",
      image: "/onboarding/annotate.png",
    },
  ]

const DotLottieWc = "dotlottie-wc" as ElementType

const PROVIDERS: ReadonlyArray<ProviderDefinition> = [
  {
    name: "OpenAI",
    icon: "openai",
    sdkInstall: "npm install openai @latitude-data/telemetry",
    sdkEnv: "OPENAI_API_KEY=sk-...",
    otelSetup: "Use OpenTelemetry Node SDK with the OpenAI client and export spans to Latitude.",
  },
  {
    name: "Anthropic",
    icon: "anthropic",
    sdkInstall: "npm install @anthropic-ai/sdk @latitude-data/telemetry",
    sdkEnv: "ANTHROPIC_API_KEY=sk-ant-...",
    otelSetup: "Instrument Anthropic calls with OpenTelemetry and ship traces to Latitude OTLP endpoint.",
  },
  {
    name: "Gemini",
    icon: "googleGemini",
    sdkInstall: "npm install @google/genai @latitude-data/telemetry",
    sdkEnv: "GEMINI_API_KEY=...",
    otelSetup: "Enable OpenTelemetry for Google GenAI calls and export trace batches to Latitude.",
  },
  {
    name: "Azure OpenAI",
    icon: "azure",
    sdkInstall: "npm install openai @latitude-data/telemetry",
    sdkEnv: "AZURE_OPENAI_ENDPOINT=https://...\nAZURE_OPENAI_API_KEY=...",
    otelSetup: "Use OpenTelemetry + Azure OpenAI client and route spans through OTLP exporter.",
  },
  {
    name: "Amazon Bedrock",
    icon: "bedrock",
    sdkInstall: "npm install @aws-sdk/client-bedrock-runtime @latitude-data/telemetry",
    sdkEnv: "AWS_REGION=us-east-1",
    otelSetup: "Instrument Bedrock runtime calls with OpenTelemetry and forward traces to Latitude.",
  },
  {
    name: "Vertex AI",
    icon: "googleVertex",
    sdkInstall: "npm install @google-cloud/vertexai @latitude-data/telemetry",
    sdkEnv: "GOOGLE_APPLICATION_CREDENTIALS=/path/credentials.json",
    otelSetup: "Add OpenTelemetry instrumentation around Vertex requests and export to Latitude.",
  },
  {
    name: "Cohere",
    icon: "cohere",
    sdkInstall: "npm install cohere-ai @latitude-data/telemetry",
    sdkEnv: "COHERE_API_KEY=...",
    otelSetup: "Wrap Cohere requests in OpenTelemetry spans and export through OTLP.",
  },
  {
    name: "Together AI",
    icon: "sparkles",
    sdkInstall: "npm install together-ai @latitude-data/telemetry",
    sdkEnv: "TOGETHER_API_KEY=...",
    otelSetup: "Capture Together AI spans through OpenTelemetry and ship to Latitude.",
  },
  {
    name: "Google AI Platform",
    icon: "googleGemini",
    sdkInstall: "npm install @google-cloud/aiplatform @latitude-data/telemetry",
    sdkEnv: "GOOGLE_APPLICATION_CREDENTIALS=/path/credentials.json",
    otelSetup: "Instrument AI Platform client calls with OpenTelemetry and forward to Latitude.",
  },
  {
    name: "Groq",
    icon: "groq",
    sdkInstall: "pip install groq latitude-telemetry",
    sdkEnv: "GROQ_API_KEY=...",
    otelSetup: "Use OpenTelemetry Python instrumentation and export Groq traces to Latitude.",
  },
  {
    name: "Mistral",
    icon: "mistral",
    sdkInstall: "pip install mistralai latitude-telemetry",
    sdkEnv: "MISTRAL_API_KEY=...",
    otelSetup: "Emit OpenTelemetry spans for Mistral requests and send via OTLP.",
  },
  {
    name: "LiteLLM",
    icon: "sparkles",
    sdkInstall: "pip install litellm latitude-telemetry",
    sdkEnv: "LITELLM_API_KEY=...",
    otelSetup: "Attach OpenTelemetry around LiteLLM completions and export to Latitude.",
  },
  {
    name: "Ollama",
    icon: "sparkles",
    sdkInstall: "pip install ollama latitude-telemetry",
    sdkEnv: "OLLAMA_HOST=http://localhost:11434",
    otelSetup: "Wrap Ollama chat calls with OpenTelemetry spans and export to Latitude.",
  },
  {
    name: "Replicate",
    icon: "sparkles",
    sdkInstall: "pip install replicate latitude-telemetry",
    sdkEnv: "REPLICATE_API_TOKEN=r8_...",
    otelSetup: "Use OpenTelemetry Python SDK to capture Replicate traces and route to Latitude.",
  },
  {
    name: "AWS SageMaker",
    icon: "bedrock",
    sdkInstall: "pip install boto3 latitude-telemetry",
    sdkEnv: "AWS_REGION=us-east-1",
    otelSetup: "Instrument SageMaker runtime requests and export OTLP spans to Latitude.",
  },
  {
    name: "Hugging Face Transformers",
    icon: "sparkles",
    sdkInstall: "pip install transformers latitude-telemetry",
    sdkEnv: "HF_TOKEN=hf_...",
    otelSetup: "Add OpenTelemetry spans around transformer inference and export to Latitude.",
  },
  {
    name: "IBM watsonx.ai",
    icon: "sparkles",
    sdkInstall: "pip install ibm-watsonx-ai latitude-telemetry",
    sdkEnv: "WATSONX_API_KEY=...",
    otelSetup: "Capture watsonx calls with OpenTelemetry and export traces to Latitude.",
  },
  {
    name: "Aleph Alpha",
    icon: "sparkles",
    sdkInstall: "pip install aleph-alpha-client latitude-telemetry",
    sdkEnv: "ALEPH_ALPHA_API_KEY=...",
    otelSetup: "Instrument Aleph Alpha request flow and export spans to Latitude OTLP endpoint.",
  },
]

export function OnboardingFlow({
  projectId,
  onOpenProjectTraces,
}: {
  readonly projectId: string
  readonly onOpenProjectTraces: (projectId: string) => Promise<void>
}) {
  const [step, setStep] = useState<"role" | "provider">("role")
  const [role, setRole] = useState<OnboardingRole>("engineer")
  const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition>(PROVIDERS[0] as ProviderDefinition)
  const [integrationMode, setIntegrationMode] = useState<IntegrationMode>("sdk")
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [isDotLottieReady, setIsDotLottieReady] = useState(false)
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

  useMountEffect(() => {
    if (typeof document === "undefined") return
    if (document.querySelector('script[data-dotlottie-wc="true"]')) {
      setIsDotLottieReady(true)
      return
    }
    const script = document.createElement("script")
    script.type = "module"
    script.src = "https://unpkg.com/@lottiefiles/dotlottie-wc@0.9.3/dist/dotlottie-wc.js"
    script.dataset.dotlottieWc = "true"
    script.addEventListener("load", () => {
      setIsDotLottieReady(true)
    })
    document.head.appendChild(script)
  })

  const activeGalleryItem = WAITING_GALLERY[galleryIndex]!

  return (
    <div className="h-full flex flex-row bg-background">
      <div className="w-1/2 min-w-0 h-full flex flex-col items-center justify-between border-r border-border p-24">
        {step === "role" ? (
          <div className="w-full max-w-[560px] flex flex-col gap-8">
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
        ) : (
          <div className="w-full max-w-[560px] flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="h-8 w-8 overflow-hidden rounded-md">
                {isDotLottieReady ? (
                  <DotLottieWc
                    src="https://lottie.host/40f19b57-50b7-4419-afb3-a8bb2b8623c8/nr6mmYVplZ.lottie"
                    autoplay
                    loop
                    style={{ width: "32px", height: "32px" }}
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Text.H2 weight="medium">
                  {traceReceived ? "Trace received. Redirecting…" : "Waiting for traces"}
                </Text.H2>
                <Text.H4 color="foregroundMuted">Set up Latitude in your project and start sending traces</Text.H4>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Text.H5M>Select your LLM provider</Text.H5M>
              <div className="flex flex-row flex-wrap gap-1">
                {PROVIDERS.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    onClick={() => setSelectedProvider(provider)}
                    className={`h-6 px-2 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${selectedProvider.name === provider.name ? "bg-primary-muted text-primary border-primary/30" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                  >
                    <ProviderIcon provider={provider.icon} size="xs" />
                    <span>{provider.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <Tabs
              options={[
                {
                  id: "sdk",
                  label: "SDK integrations",
                  icon: <ListTree className="w-4 h-4" />,
                },
                {
                  id: "opentelemetry",
                  label: "OpenTelemetry",
                  icon: <DoorOpen className="w-4 h-4" />,
                },
              ]}
              active={integrationMode}
              onSelect={(id) => setIntegrationMode(id as IntegrationMode)}
            />

            <div className="flex flex-col gap-2">
              <Text.H5M>Install Latitude Telemetry using your package manager</Text.H5M>
              <CodeBlock value={selectedProvider.sdkInstall} copyable />
            </div>

            <div className="flex flex-col gap-2">
              <Text.H5M>Add environment variables</Text.H5M>
              <Text.H5 color="foregroundMuted">
                Add environment variables to your `.env` file and container environment. You can find your project
                details in project settings.
              </Text.H5>
              <CodeBlock
                value={
                  integrationMode === "sdk"
                    ? `${selectedProvider.sdkEnv}\nLATITUDE_PROJECT_ID=${projectId}`
                    : `${selectedProvider.otelSetup}\nLATITUDE_PROJECT_ID=${projectId}`
                }
                copyable
              />
            </div>

            <Button variant="outline" onClick={() => setStep("role")}>
              Back
            </Button>
          </div>
        )}

        <div className="w-full flex items-center justify-center gap-2">
          <div className={`h-1.5 rounded-full ${step === "role" ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
          <div className={`h-1.5 rounded-full ${step === "provider" ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
        </div>
      </div>

      <div className="w-1/2 min-w-0 bg-secondary h-full overflow-hidden">
        <div className="h-full w-full min-w-0 flex items-center justify-center overflow-hidden p-24">
          {step === "role" ? (
            <div className="h-fit w-full flex flex-col gap-0 justify-center items-start">
              <div className="max-w-[591px] flex flex-col gap-6">
                <Text.H3M color="foregroundMuted">"{ROLE_TESTIMONIALS[role].quote}"</Text.H3M>
                <div className="flex flex-row items-center gap-3">
                  <img
                    src="/onboarding/testimonial-avatar.png"
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div className="flex flex-col">
                    <Text.H5M>{ROLE_TESTIMONIALS[role].name}</Text.H5M>
                    <Text.H6 color="foregroundMuted">{ROLE_TESTIMONIALS[role].title}</Text.H6>
                  </div>
                </div>
              </div>
              <div className="mt-10 w-full aspect-[946/616] rounded-xl border-[6px] border-[#0b0f19] overflow-hidden shadow-xl">
                <img
                  src={ROLE_MOCKUPS[role]}
                  alt={`${role} preview`}
                  className="h-full w-full object-cover object-left-top"
                />
              </div>
            </div>
          ) : (
            <div className="h-fit w-full flex flex-col gap-0 justify-center items-start">
              <div className="w-full max-w-[591px] flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <Text.H5M>{activeGalleryItem.title}</Text.H5M>
                  <Text.H6 color="foregroundMuted">{activeGalleryItem.description}</Text.H6>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    flat
                    onClick={() => setGalleryIndex((c) => (c === 0 ? WAITING_GALLERY.length - 1 : c - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    flat
                    onClick={() => setGalleryIndex((c) => (c + 1) % WAITING_GALLERY.length)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-10 w-full aspect-[946/616] rounded-xl border-[6px] border-[#0b0f19] overflow-hidden shadow-xl">
                <img
                  src={activeGalleryItem.image}
                  alt={activeGalleryItem.title}
                  className="h-full w-full object-cover object-left-top"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
