import type { CheckedState } from "@repo/ui"
import {
  AmazonQIcon,
  AnthropicIcon,
  AzureIcon,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ClaudeIcon,
  CloudflareIcon,
  CloudflareWorkersIcon,
  CodeBlock,
  CohereIcon,
  Conversation,
  CopilotIcon,
  CopyButton,
  DeepseekIcon,
  FormField,
  GeminiIcon,
  GitHubIcon,
  GitlabIcon,
  GoogleIcon,
  GrokIcon,
  GroqIcon,
  HuggingfaceIcon,
  Icon,
  Input,
  KilocodeIcon,
  KimiIcon,
  Label,
  LatitudeLogo,
  MetaIcon,
  MistralIcon,
  NvidiaIcon,
  OllamaIcon,
  OpenaiIcon,
  OpencodeIcon,
  OpenrouterIcon,
  PerplexityIcon,
  QwenIcon,
  ReplitIcon,
  RichTextEditor,
  TagBadge,
  TagBadgeList,
  Text,
  TogetheraiIcon,
  useMountEffect,
  V0Icon,
  VercelIcon,
  XaiIcon,
} from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { LucideProps } from "lucide-react"
import { Check, Moon, Palette, Sparkles, Sun } from "lucide-react"
import type { ComponentType } from "react"
import { useState } from "react"

const PROVIDER_ICONS: { name: string; icon: ComponentType<LucideProps> }[] = [
  { name: "Amazon Q", icon: AmazonQIcon },
  { name: "Anthropic", icon: AnthropicIcon },
  { name: "Azure", icon: AzureIcon },
  { name: "Claude", icon: ClaudeIcon },
  { name: "Cloudflare", icon: CloudflareIcon },
  { name: "Cloudflare Workers", icon: CloudflareWorkersIcon },
  { name: "Cohere", icon: CohereIcon },
  { name: "Copilot", icon: CopilotIcon },
  { name: "DeepSeek", icon: DeepseekIcon },
  { name: "Gemini", icon: GeminiIcon },
  { name: "GitLab", icon: GitlabIcon },
  { name: "Grok", icon: GrokIcon },
  { name: "Groq", icon: GroqIcon },
  { name: "Hugging Face", icon: HuggingfaceIcon },
  { name: "Kilocode", icon: KilocodeIcon },
  { name: "Kimi", icon: KimiIcon },
  { name: "Meta", icon: MetaIcon },
  { name: "Mistral", icon: MistralIcon },
  { name: "NVIDIA", icon: NvidiaIcon },
  { name: "Ollama", icon: OllamaIcon },
  { name: "OpenAI", icon: OpenaiIcon },
  { name: "OpenCode", icon: OpencodeIcon },
  { name: "OpenRouter", icon: OpenrouterIcon },
  { name: "Perplexity", icon: PerplexityIcon },
  { name: "Qwen", icon: QwenIcon },
  { name: "Replit", icon: ReplitIcon },
  { name: "Together AI", icon: TogetheraiIcon },
  { name: "v0", icon: V0Icon },
  { name: "Vercel", icon: VercelIcon },
  { name: "xAI", icon: XaiIcon },
]

export const Route = createFileRoute("/design-system")({
  component: DesignSystemPage,
})

function ShowcaseSection({
  title,
  description,
  theme,
  children,
}: {
  title: string
  description: string
  theme: "light" | "dark"
  children: React.ReactNode
}) {
  const surfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  return (
    <Card className={`relative overflow-hidden border-border/70 shadow-xl ${surfaceClass}`}>
      <CardHeader className="relative">
        <CardTitle>
          <Text.H4 className="text-balance">{title}</Text.H4>
        </CardTitle>
        <CardDescription>
          <Text.H6 color="foregroundMuted">{description}</Text.H6>
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">{children}</CardContent>
    </Card>
  )
}

function DesignSystemShowcase({ theme }: { theme: "light" | "dark" }) {
  const surfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  return (
    <div
      className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/70 p-4 shadow-2xl sm:p-5 ${surfaceClass}`}
    >
      <div
        className={`relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3 ${surfaceClass}`}
      >
        <div className="flex items-center gap-2">
          <Icon icon={Palette} color="accentForeground" />
          <Text.H5 weight="semibold">{theme === "light" ? "Light Theme" : "Dark Theme"}</Text.H5>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border border-border/60 p-2 ${surfaceClass}`}>
          <LatitudeLogo className="h-5 w-5" />
          <Text.H6 color="foregroundMuted">@repo/ui</Text.H6>
        </div>
      </div>

      <ShowcaseSection theme={theme} title="Typography" description="Text scales and mono primitives.">
        <div className="flex flex-col gap-2">
          <Text.H1>Heading 1</Text.H1>
          <Text.H2>Heading 2</Text.H2>
          <Text.H3>Heading 3</Text.H3>
          <Text.H4>Heading 4</Text.H4>
          <Text.H5>Heading 5</Text.H5>
          <Text.H6>Heading 6</Text.H6>
          <Text.Mono>const status = "ready";</Text.Mono>
        </div>
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Buttons" description="Variants, states, and visual hierarchy.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline" flat>
            Outline Flat
          </Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button isLoading>Loading…</Button>
        </div>
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Badge" description="Status and label chips.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">Default</Badge>
          <Badge variant="outlineMuted" size="small" className="font-mono uppercase tracking-wider">
            v:clxyz
          </Badge>
          <Badge variant="muted">Muted</Badge>
        </div>
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Forms" description="Input, label, and form field composition.">
        <div className="flex flex-col gap-4">
          <Input
            label={<Text.H6>Email</Text.H6>}
            name="email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="hello@latitude.so…"
          />
          <FormField
            label={<Text.H6>Workspace Name</Text.H6>}
            description={<Text.H6 color="foregroundMuted">Used across your tenant settings.</Text.H6>}
            errors={["Use at least 3 characters."]}
          >
            <Input name="workspaceName" autoComplete="off" placeholder="Acme Inc.…" aria-invalid="true" />
          </FormField>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`manual-input-${theme}`}>
              <Text.H6>Manual Label + Input</Text.H6>
            </Label>
            <Input
              id={`manual-input-${theme}`}
              name={`manual-input-${theme}`}
              autoComplete="off"
              placeholder="Custom field…"
            />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Checkbox" description="Selection control with indeterminate state.">
        <CheckboxShowcase />
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Rich Text Editor"
        description="Lazy-loaded CodeMirror editor with JSON detection."
      >
        <RichTextEditorShowcase />
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Code Block"
        description="Read-only syntax-highlighted code viewer, powered by CodeMirror."
      >
        <CodeBlockShowcase />
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Copy Button" description="Clipboard copy with feedback.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-row items-center gap-2">
            <Text.Mono>Hello, world!</Text.Mono>
            <CopyButton value="Hello, world!" />
          </div>
          <div className="flex flex-row items-center gap-2">
            <Text.Mono>cuid_abc123def456</Text.Mono>
            <CopyButton value="cuid_abc123def456" />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Tag Badges"
        description="Color-coded tags with deterministic hue derived from content."
      >
        <TagBadgeShowcase />
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="GenAI Conversation"
        description="Renders a conversation with system instructions, user messages, assistant responses, and tool calls."
      >
        <GenAIConversationShowcase />
      </ShowcaseSection>

      <Card className={`relative overflow-hidden border-border/70 shadow-xl ${surfaceClass}`}>
        <CardHeader className="relative">
          <CardTitle>
            <Text.H4 className="text-balance">Icons</Text.H4>
          </CardTitle>
          <CardDescription>
            <Text.H6 color="foregroundMuted">Lucide wrapper and brand icons.</Text.H6>
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Icon icon={Sparkles} size="sm" color="primary" />
              <Icon icon={Check} size="default" color="success" />
              <Icon icon={Palette} size="md" color="accentForeground" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <GoogleIcon className="h-5 w-5" />
              <GitHubIcon className="h-5 w-5" />
              <LatitudeLogo className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="relative">
          <Text.H6 color="foregroundMuted">
            `Select`, `Skeleton`, and `Tooltip` are exported in `@repo/ui` and are currently pending implementation.
          </Text.H6>
        </CardFooter>
      </Card>

      <ShowcaseSection theme={theme} title="Provider Icons" description="LLM and AI provider brand icons.">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {PROVIDER_ICONS.map(({ name, icon: ProviderIconComponent }) => (
            <div key={name} className="flex flex-col items-center gap-2 rounded-lg border border-border/50 p-3">
              <Icon icon={ProviderIconComponent} size="md" />
              <Text.H6 color="foregroundMuted" className="text-center text-xs">
                {name}
              </Text.H6>
            </div>
          ))}
        </div>
      </ShowcaseSection>
    </div>
  )
}

function CheckboxShowcase() {
  const [checked, setChecked] = useState<CheckedState>(false)
  const [showHitArea, setShowHitArea] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox checked={false} />
          <Text.H6>Unchecked</Text.H6>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked />
          <Text.H6>Checked</Text.H6>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked="indeterminate" />
          <Text.H6>Indeterminate</Text.H6>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox disabled />
          <Text.H6 color="foregroundMuted">Disabled</Text.H6>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={setChecked} className="hit-area-3" debugHitArea={showHitArea} />
        <Text.H6>Interactive (hit-area-3) — state: {String(checked)}</Text.H6>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={showHitArea} onCheckedChange={(v) => setShowHitArea(v === true)} />
        <Text.H6>Show hit area debug overlay</Text.H6>
      </div>
    </div>
  )
}

function RichTextEditorShowcase() {
  const [jsonValue, setJsonValue] = useState('{\n  "name": "Latitude",\n  "type": "platform"\n}')
  const [textValue, setTextValue] = useState("Hello, world!\nThis is plain text content.")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H6 weight="bold">JSON content (auto-detected)</Text.H6>
        <RichTextEditor value={jsonValue} onChange={setJsonValue} minHeight="100px" />
      </div>
      <div className="flex flex-col gap-1">
        <Text.H6 weight="bold">Plain text</Text.H6>
        <RichTextEditor value={textValue} onChange={setTextValue} minHeight="80px" />
      </div>
    </div>
  )
}

const SAMPLE_JSON = JSON.stringify(
  {
    traceId: "abc123def456",
    model: "gpt-4o",
    provider: "openai",
    tokens: { input: 1250, output: 384, reasoning: 0 },
    tags: ["production", "chat"],
    metadata: { userId: "usr_9x8y7z", sessionId: "sess_a1b2c3" },
  },
  null,
  2,
)

function CodeBlockShowcase() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H6 weight="bold">JSON content (auto-highlighted, copyable)</Text.H6>
        <CodeBlock value={SAMPLE_JSON} copyable />
      </div>
      <div className="flex flex-col gap-1">
        <Text.H6 weight="bold">Plain text (no copy button)</Text.H6>
        <CodeBlock value={"SELECT id, name, status\nFROM spans\nWHERE trace_id = 'abc123'\nORDER BY start_time DESC"} />
      </div>
    </div>
  )
}

const SAMPLE_TAGS = [
  "production",
  "staging",
  "development",
  "experiment-a",
  "experiment-b",
  "canary",
  "v2.1.0",
  "chat",
  "rag",
  "batch",
  "user:premium",
  "region:eu-west",
  "gpt-4o",
  "claude-sonnet",
]

function TagBadgeShowcase() {
  const [customTag, setCustomTag] = useState("my-custom-tag")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H6 weight="bold">Preset tags</Text.H6>
        <TagBadgeList tags={SAMPLE_TAGS} />
      </div>

      <div className="flex flex-col gap-2">
        <Text.H6 weight="bold">Custom tag</Text.H6>
        <div className="flex flex-row items-center gap-3">
          <Input
            name="custom-tag"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Type anything…"
            autoComplete="off"
            className="max-w-64"
          />
          {customTag && <TagBadge tag={customTag} />}
        </div>
        <Text.H6 color="foregroundMuted">Type to see how the color changes with the content.</Text.H6>
      </div>
    </div>
  )
}

function GenAIConversationShowcase() {
  return (
    <Conversation
      systemInstructions={[
        {
          type: "text" as const,
          content:
            "You are a multi-modal research assistant. Use tools to gather real-time information. Always verify facts before answering. When analyzing media, describe what you observe in detail.",
        },
      ]}
      messages={[
        {
          role: "user" as const,
          parts: [
            { type: "text" as const, content: "Can you identify the landmark in this photo and tell me about it?" },
            {
              type: "uri" as const,
              uri: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg",
              modality: "image",
            },
          ],
        },
        {
          role: "assistant" as const,
          parts: [
            {
              type: "reasoning" as const,
              content:
                "The image shows a tall iron lattice tower against a blue sky. This is clearly the Eiffel Tower in Paris, France.",
            },
            {
              type: "reasoning" as const,
              content:
                "The user wants me to tell them about it. I should look up some current information rather than relying on my training data. Let me search for recent visitor stats and any current events.",
            },
            {
              type: "reasoning" as const,
              content: "I should also check the current weather in Paris since the user might want to visit.",
            },
            {
              type: "text" as const,
              content: "That's the **Eiffel Tower** in Paris! Let me look up some current details for you.",
            },
            {
              type: "tool_call" as const,
              name: "web_search",
              id: "call_search_01",
              arguments: { query: "Eiffel Tower current visitor information 2026" },
            },
            {
              type: "tool_call" as const,
              name: "get_weather",
              id: "call_weather_01",
              arguments: { location: "Paris, France", units: "metric" },
            },
          ],
        },
        {
          role: "tool" as const,
          parts: [
            {
              type: "tool_call_response" as const,
              id: "call_search_01",
              response:
                '{"results": ["The Eiffel Tower welcomed 6.3 million visitors in 2025", "Current ticket price: €29.40 for adults to the summit", "Open daily 9:30 AM - 11:45 PM"]}',
            },
          ],
        },
        {
          role: "tool" as const,
          parts: [
            {
              type: "tool_call_response" as const,
              id: "call_weather_01",
              response: '{"temperature": 14, "condition": "Overcast", "wind": "12 km/h NW", "humidity": 78}',
            },
          ],
        },
        {
          role: "assistant" as const,
          parts: [
            {
              type: "text" as const,
              content:
                "Here's what I found about the Eiffel Tower:\n\n\u2022 **Visitors**: 6.3 million in 2025\n\u2022 **Tickets**: \u20AC29.40 for adults to the summit\n\u2022 **Hours**: Open daily 9:30 AM \u2013 11:45 PM\n\nCurrent weather in Paris is 14\u00B0C, overcast with 78% humidity \u2014 bring a jacket if you're visiting!",
            },
          ],
        },
        {
          role: "user" as const,
          parts: [
            { type: "text" as const, content: "Can you transcribe this audio clip?" },
            {
              type: "uri" as const,
              uri: "https://www.example.com/sample-audio.mp3",
              modality: "audio",
              mime_type: "audio/mpeg",
            },
          ],
        },
        {
          role: "assistant" as const,
          parts: [
            {
              type: "tool_call" as const,
              name: "transcribe_audio",
              id: "call_transcribe_01",
              arguments: { url: "https://www.example.com/sample-audio.mp3", language: "auto" },
            },
          ],
        },
        {
          role: "tool" as const,
          parts: [
            {
              type: "tool_call_response" as const,
              id: "call_transcribe_01",
              response:
                '{"error": "AudioProcessingError: Unable to decode audio stream. The file may be corrupted or in an unsupported format."}',
              _provider_metadata: { _known_fields: { isError: true, toolName: "transcribe_audio" } },
            },
          ],
        },
        {
          role: "assistant" as const,
          parts: [
            {
              type: "text" as const,
              content:
                "I wasn't able to transcribe that audio \u2014 the file appears to be corrupted or in an unsupported format. Could you try uploading it again, or share it in a different format (WAV, MP3, or M4A)?",
            },
          ],
        },
        {
          role: "user" as const,
          parts: [
            {
              type: "text" as const,
              content: "Forget the audio. Here's a document and a short video for your analysis:",
            },
            { type: "file" as const, file_id: "file_abc123xyz", modality: "document" },
            {
              type: "uri" as const,
              uri: "https://www.example.com/sample-video.mp4",
              modality: "video",
              mime_type: "video/mp4",
            },
          ],
        },
        {
          role: "assistant" as const,
          parts: [
            {
              type: "reasoning" as const,
              content:
                "The user sent both a document and a video. I'll analyze the document first using the file reader tool, then describe the video.",
            },
            {
              type: "tool_call" as const,
              name: "read_document",
              id: "call_read_doc_01",
              arguments: { file_id: "file_abc123xyz", extract: "summary" },
            },
            {
              type: "tool_call" as const,
              name: "analyze_video",
              id: "call_analyze_video_01",
              arguments: { url: "https://www.example.com/sample-video.mp4", frames: 5 },
            },
          ],
        },
        {
          role: "assistant" as const,
          parts: [
            {
              type: "text" as const,
              content: "I'm sorry, but I can't process that content as it appears to violate our usage policies.",
              _provider_metadata: { _known_fields: { isRefusal: true } },
            },
          ],
        },
        {
          role: "user" as const,
          parts: [
            {
              type: "uri" as const,
              uri: "https://arxiv.org/abs/2301.07041",
              modality: "document",
              mime_type: "text/html",
            },
            { type: "text" as const, content: "What do you think of this paper?" },
          ],
        },
        {
          role: "system" as const,
          parts: [
            {
              type: "text" as const,
              content: "[Context updated: User has premium access. Extended tool usage enabled.]",
            },
          ],
        },
        {
          role: "assistant" as const,
          parts: [
            {
              type: "text" as const,
              content: "I can see the link points to an arXiv paper. Let me look it up to give you a proper summary.",
            },
          ],
        },
      ]}
    />
  )
}

function DesignSystemPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const pageSurfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  const applyTheme = (nextTheme: "light" | "dark") => {
    const root = document.documentElement
    root.classList.toggle("dark", nextTheme === "dark")
    root.style.colorScheme = nextTheme
  }

  const restoreHostTheme = () => {
    const root = document.documentElement
    const hostTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    root.classList.toggle("dark", hostTheme === "dark")
    root.style.colorScheme = hostTheme
  }

  useMountEffect(() => {
    applyTheme(theme)
    return () => {
      restoreHostTheme()
    }
  })

  return (
    <>
      <a
        href="#design-system-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>
      <main
        id="design-system-main"
        className={`flex min-h-screen flex-col gap-6 overflow-x-hidden p-4 text-foreground sm:p-6 lg:p-8 ${pageSurfaceClass}`}
      >
        <div className="flex w-full max-w-7xl self-center flex-col gap-6">
          <header
            className={`flex flex-col gap-4 rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${pageSurfaceClass}`}
          >
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <span aria-hidden="true">←</span>
              Back to Home
            </Link>

            <div className="flex flex-col gap-2">
              <Text.H6 color="accentForeground" weight="semibold">
                UI Inventory
              </Text.H6>
              <Text.H2 className="text-balance">Design System</Text.H2>
            </div>

            <Text.H6 color="foregroundMuted">
              Review every implemented `@repo/ui` component in one place. Toggle theme to validate visual parity.
            </Text.H6>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  flat
                  onClick={() => {
                    setTheme((currentTheme) => {
                      const nextTheme = currentTheme === "light" ? "dark" : "light"
                      applyTheme(nextTheme)
                      return nextTheme
                    })
                  }}
                >
                  <Icon icon={theme === "light" ? Moon : Sun} size="sm" />
                  {theme === "light" ? "Switch to Dark" : "Switch to Light"}
                </Button>
              </div>

              <div className={`flex items-center gap-2 rounded-lg border border-border/60 p-2 ${pageSurfaceClass}`}>
                <Text.H6 color="foregroundMuted">Theme</Text.H6>
                <Text.Mono>{theme}</Text.Mono>
              </div>
            </div>
          </header>

          <DesignSystemShowcase theme={theme} />
        </div>
      </main>
    </>
  )
}
