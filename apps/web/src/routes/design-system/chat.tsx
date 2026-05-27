import { Button, Conversation, Icon, Text, useMountEffect } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import type { GenAIMessage } from "rosetta-ai"

export const Route = createFileRoute("/design-system/chat")({
  component: ChatPage,
})

// A tiny inline SVG (base64) so the "working image" case renders without any network access.
const IMAGE_BLOB_B64 =
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTQwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNjM2NmYxIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZWM0ODk5Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjI0MCIgaGVpZ2h0PSIxNDAiIHJ4PSIxMiIgZmlsbD0idXJsKCNnKSIvPjx0ZXh0IHg9IjEyMCIgeT0iNzgiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjIwIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+aW1hZ2UgYmxvYjwvdGV4dD48L3N2Zz4="
// A small CSV (base64) used to demonstrate downloading an inline blob document.
const CSV_BLOB_B64 = "bmFtZSxzY29yZQpBbGljZSw5CkJvYiw3CkNhcm9sLDgK"

// Remote sample media (renders when online; the broken URLs below show the
// fallback behavior when a source is missing / inaccessible).
const SAMPLE_IMAGE_URI = "https://picsum.photos/id/237/240/140"
const SAMPLE_AUDIO_URI = "https://www.w3schools.com/html/horse.mp3"
const SAMPLE_VIDEO_URI = "https://www.w3schools.com/html/mov_bbb.mp4"
const BROKEN_IMAGE_URI = "https://example.com/this-image-does-not-exist.png"
const BROKEN_VIDEO_URI = "https://invalid.invalid/private-clip.mp4"
const BROKEN_AUDIO_URI = "https://invalid.invalid/voice-note.mp3"

const MARKDOWN_SAMPLE = `Here's a breakdown with **rich markdown**:

1. A numbered list item
2. Another with \`inline code\`

\`\`\`ts
function greet(name: string) {
  return \`Hello, \${name}!\`
}
\`\`\`

| Provider | Latency |
| --- | --- |
| OpenAI | 420ms |
| Anthropic | 380ms |

> And a blockquote for good measure.`

const JSON_SAMPLE = JSON.stringify(
  { status: "ok", model: "claude-opus-4-7", usage: { input_tokens: 1240, output_tokens: 318 }, items: [1, 2, 3] },
  null,
  2,
)

// Long enough (> ~3000 chars) to trigger the large-markdown "show more" split.
const LONG_TEXT = Array.from(
  { length: 14 },
  (_, i) =>
    `Paragraph ${i + 1}. This is a long assistant response used to demonstrate how the renderer collapses oversized content behind a "show more" affordance, snapping to paragraph boundaries so the head and tail stay readable while the middle is hidden until expanded.`,
).join("\n\n")

// `as GenAIMessage[]` — the schema is permissive (z.core.$loose) and we want to exercise
// edge cases (unknown part types/roles, refusals) that aren't in the strict TS unions.
// Fields use the wire-format snake_case shape the renderer expects.
const TEXT_MESSAGES = [
  {
    role: "system",
    parts: [
      {
        type: "text",
        content: "You are Latitude's helpful assistant. Be concise, cite sources, and refuse unsafe requests.",
      },
    ],
  },
  { role: "user", parts: [{ type: "text", content: "Can you summarize the provider latencies?" }] },
  { role: "assistant", parts: [{ type: "text", content: MARKDOWN_SAMPLE }] },
  // JSON-block text part — renders via JsonContent (syntax-highlighted).
  { role: "assistant", parts: [{ type: "text", content: JSON_SAMPLE }] },
  // Long content — renders with the "show more" middle collapse.
  { role: "assistant", parts: [{ type: "text", content: LONG_TEXT }] },
] as GenAIMessage[]

const MEDIA_MESSAGES = [
  {
    role: "user",
    parts: [
      { type: "text", content: "Images — inline blob, working remote URL, and a broken URL:" },
      { type: "blob", modality: "image", mime_type: "image/svg+xml", content: IMAGE_BLOB_B64 },
      { type: "uri", modality: "image", mime_type: "image/jpeg", uri: SAMPLE_IMAGE_URI },
      { type: "uri", modality: "image", mime_type: "image/png", uri: BROKEN_IMAGE_URI },
    ],
  },
  {
    role: "user",
    parts: [
      { type: "text", content: "Audio — working and broken:" },
      { type: "uri", modality: "audio", mime_type: "audio/mpeg", uri: SAMPLE_AUDIO_URI },
      { type: "uri", modality: "audio", mime_type: "audio/mpeg", uri: BROKEN_AUDIO_URI },
    ],
  },
  {
    role: "user",
    parts: [
      { type: "text", content: "Video — working and broken:" },
      { type: "uri", modality: "video", mime_type: "video/mp4", uri: SAMPLE_VIDEO_URI },
      { type: "uri", modality: "video", mime_type: "video/mp4", uri: BROKEN_VIDEO_URI },
    ],
  },
] as GenAIMessage[]

const FILE_MESSAGES = [
  {
    role: "user",
    parts: [
      { type: "text", content: "File references (file_id, no resolvable source → no action):" },
      { type: "file", modality: "document", mime_type: "application/pdf", file_id: "file_q3_report_abc123" },
      { type: "file", modality: "document", mime_type: "text/csv", file_id: "file_metrics_def456" },
      { type: "file", modality: "document", mime_type: "application/zip", file_id: "file_export_ghi789" },
      { type: "file", modality: "document", mime_type: "text/x-python", file_id: "file_script_jkl012" },
      { type: "file", modality: "image", mime_type: "image/png", file_id: "file_diagram_mno345" },
    ],
  },
  {
    role: "user",
    parts: [
      { type: "text", content: "A linked document (uri → Open) and an inline one (blob → Download):" },
      { type: "uri", modality: "document", mime_type: "application/pdf", uri: "https://docs.latitude.so/guide.pdf" },
      { type: "blob", modality: "document", mime_type: "text/csv", content: CSV_BLOB_B64 },
    ],
  },
] as GenAIMessage[]

const TOOL_MESSAGES = [
  {
    role: "assistant",
    parts: [
      { type: "text", content: "Let me look up the latest metrics for you." },
      { type: "tool_call", id: "call_metrics_1", name: "get_metrics", arguments: { range: "7d", metric: "p95" } },
    ],
  },
  // Success result — absorbed into the tool_call above (matched by id).
  {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: "call_metrics_1",
        response: { p95_latency_ms: 412, samples: 18234, region: "us-east-1" },
        _provider_metadata: { _known_fields: { toolName: "get_metrics" } },
      },
    ],
  },
  {
    role: "assistant",
    parts: [
      { type: "text", content: "Now fetching invoices…" },
      { type: "tool_call", id: "call_inv_1", name: "fetch_invoices", arguments: { customerId: "cus_123" } },
    ],
  },
  // Error result — absorbed, destructive styling.
  {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: "call_inv_1",
        response: { error: "Upstream provider timed out after 30s" },
        _provider_metadata: { _known_fields: { toolName: "fetch_invoices", isError: true } },
      },
    ],
  },
  // Multiple tool calls in a single assistant message.
  {
    role: "assistant",
    parts: [
      { type: "text", content: "Running a couple of lookups in parallel:" },
      { type: "tool_call", id: "call_a", name: "search_docs", arguments: { q: "rate limits" } },
      { type: "tool_call", id: "call_b", name: "get_user", arguments: { id: "u_42" } },
    ],
  },
  // Standalone tool error (no matching call → renders on its own).
  {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: "call_orphan",
        response: { error: "Tool execution was cancelled" },
        _provider_metadata: { _known_fields: { toolName: "run_export", isError: true } },
      },
    ],
  },
] as GenAIMessage[]

const EDGE_CASE_MESSAGES = [
  // Refusal (isRefusal known field → refusal badge).
  {
    role: "assistant",
    parts: [
      {
        type: "text",
        content: "I can't help with that request.",
        _provider_metadata: { _known_fields: { isRefusal: true } },
      },
    ],
  },
  // Multiple reasoning (thinking) parts.
  {
    role: "assistant",
    parts: [
      { type: "reasoning", content: "First, I should restate the problem to make sure I understand it." },
      { type: "reasoning", content: "Then I'll outline the steps before answering." },
      { type: "text", content: "Here's my answer after thinking it through." },
    ],
  },
  // Unknown part type → default JSON fallback block.
  {
    role: "assistant",
    parts: [
      { type: "text", content: "And a part type the renderer doesn't know about:" },
      { type: "custom_widget", payload: { kind: "chart", series: [1, 2, 3] } } as never,
    ],
  },
  // Unknown message role → default styling.
  { role: "developer", parts: [{ type: "text", content: "A message with an unrecognized role." }] },
] as GenAIMessage[]

const SECTIONS: { title: string; description: string; messages: GenAIMessage[] }[] = [
  {
    title: "Text & markdown",
    description: "System, plain text, rich markdown, JSON blocks, long-content collapse.",
    messages: TEXT_MESSAGES,
  },
  {
    title: "Media",
    description: "Image / audio / video, each with working and broken sources.",
    messages: MEDIA_MESSAGES,
  },
  {
    title: "Files & documents",
    description: "file_id references, a linked document (Open), and an inline one (Download).",
    messages: FILE_MESSAGES,
  },
  {
    title: "Tool calls",
    description: "Success and error results (absorbed), multiple calls, and a standalone error.",
    messages: TOOL_MESSAGES,
  },
  {
    title: "Roles & states",
    description: "Refusal badge, multiple reasoning parts, unknown part type, unknown role.",
    messages: EDGE_CASE_MESSAGES,
  },
]

function Section({
  title,
  description,
  surfaceClass,
  children,
}: {
  title: string
  description: string
  surfaceClass: string
  children: ReactNode
}) {
  return (
    <section className={`flex flex-col gap-4 rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${surfaceClass}`}>
      <div className="flex flex-col gap-1">
        <Text.H4>{title}</Text.H4>
        <Text.H6 color="foregroundMuted">{description}</Text.H6>
      </div>
      {children}
    </section>
  )
}

function ChatPage() {
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
    <main className={`flex min-h-screen flex-col gap-6 p-4 text-foreground sm:p-6 lg:p-8 ${pageSurfaceClass}`}>
      <div className="flex w-full max-w-3xl flex-col gap-6 self-center">
        <header
          className={`flex flex-col gap-4 rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${pageSurfaceClass}`}
        >
          <Link
            to="/design-system"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <span aria-hidden="true">←</span>
            Design system
          </Link>
          <div className="flex flex-col gap-2">
            <Text.H6 color="accentForeground" weight="semibold">
              Showcase
            </Text.H6>
            <Text.H2 className="text-balance">Chat / Conversation</Text.H2>
          </div>
          <Text.H6 color="foregroundMuted">
            Every message role and content part the renderer supports, grouped by theme: text & markdown, media (with
            broken sources), files & documents, tool calls, and edge-case roles/states.
          </Text.H6>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
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
            <div className={`flex items-center gap-2 rounded-lg border border-border/60 p-2 ${pageSurfaceClass}`}>
              <Text.H6 color="foregroundMuted">Theme</Text.H6>
              <Text.Mono>{theme}</Text.Mono>
            </div>
          </div>
        </header>

        {SECTIONS.map((section) => (
          <Section
            key={section.title}
            title={section.title}
            description={section.description}
            surfaceClass={pageSurfaceClass}
          >
            <Conversation messages={section.messages} />
          </Section>
        ))}
      </div>
    </main>
  )
}
