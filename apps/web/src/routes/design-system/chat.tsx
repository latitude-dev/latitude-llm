import { Button, Conversation, Icon, Text, useMountEffect } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { useState } from "react"
import type { GenAIMessage } from "rosetta-ai"

export const Route = createFileRoute("/design-system/chat")({
  component: ChatPage,
})

// A tiny inline SVG (base64) so the "working image" case renders without any network access.
const IMAGE_BLOB_B64 =
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTQwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNjM2NmYxIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZWM0ODk5Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjI0MCIgaGVpZ2h0PSIxNDAiIHJ4PSIxMiIgZmlsbD0idXJsKCNnKSIvPjx0ZXh0IHg9IjEyMCIgeT0iNzgiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjIwIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+aW1hZ2UgYmxvYjwvdGV4dD48L3N2Zz4="

// Remote sample media (renders when online; the broken URLs below show the
// fallback behavior when a source is missing / inaccessible).
const SAMPLE_IMAGE_URI = "https://picsum.photos/id/237/240/140"
const SAMPLE_AUDIO_URI = "https://www.w3schools.com/html/horse.mp3"
const SAMPLE_VIDEO_URI = "https://www.w3schools.com/html/mov_bbb.mp4"
const BROKEN_IMAGE_URI = "https://example.com/this-image-does-not-exist.png"
const BROKEN_VIDEO_URI = "https://invalid.invalid/private-clip.mp4"

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

// `as GenAIMessage[]` — the schema is permissive (z.core.$loose) and we want
// to exercise edge cases (unknown part types, refusals) that aren't in the
// strict TS unions. Fields use the wire-format snake_case shape the renderer expects.
const DEMO_MESSAGES = [
  // 1. System instructions
  {
    role: "system",
    parts: [
      {
        type: "text",
        content: "You are Latitude's helpful assistant. Be concise, cite sources, and refuse unsafe requests.",
      },
    ],
  },

  // 2. Plain user text
  {
    role: "user",
    parts: [{ type: "text", content: "Hey! Can you analyze the attached media and document?" }],
  },

  // 3. User with text + inline image blob + working remote image + broken image
  {
    role: "user",
    parts: [
      { type: "text", content: "Here are a few images:" },
      { type: "blob", modality: "image", mime_type: "image/svg+xml", content: IMAGE_BLOB_B64 },
      { type: "uri", modality: "image", mime_type: "image/jpeg", uri: SAMPLE_IMAGE_URI },
      // Source missing / inaccessible — shows the browser's broken-image fallback today.
      { type: "uri", modality: "image", mime_type: "image/png", uri: BROKEN_IMAGE_URI },
    ],
  },

  // 4. User with audio, video, a file reference, an unknown-modality blob, and a plain link
  {
    role: "user",
    parts: [
      { type: "text", content: "And some other attachments:" },
      { type: "uri", modality: "audio", mime_type: "audio/mpeg", uri: SAMPLE_AUDIO_URI },
      { type: "uri", modality: "video", mime_type: "video/mp4", uri: SAMPLE_VIDEO_URI },
      // Video source we can't reach — fallback behavior.
      { type: "uri", modality: "video", mime_type: "video/mp4", uri: BROKEN_VIDEO_URI },
      // File reference — rendered as an id chip (not resolved to media in the UI).
      { type: "file", modality: "image", mime_type: "application/pdf", file_id: "file_abc123report" },
      // Unknown modality blob — falls through to the MediaFallback badge.
      { type: "blob", modality: "document", mime_type: "application/pdf", content: "JVBERi0xLjcK" },
      // Non-media URI — rendered as a clickable link.
      { type: "uri", modality: "document", mime_type: "text/html", uri: "https://docs.latitude.so/guides" },
    ],
  },

  // 5. Assistant with reasoning (thinking) + rich markdown text
  {
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        content:
          "The user attached an image and a PDF. I should describe the image and offer to extract the document text.",
      },
      { type: "text", content: MARKDOWN_SAMPLE },
    ],
  },

  // 6. Assistant emitting a tool call (response is absorbed from the tool message below)
  {
    role: "assistant",
    parts: [
      { type: "text", content: "Let me look up the latest metrics for you." },
      {
        type: "tool_call",
        id: "call_metrics_1",
        name: "get_metrics",
        arguments: { range: "7d", metric: "p95_latency" },
      },
    ],
  },

  // 7. Tool result that gets absorbed into the tool_call above (matched by id)
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

  // 8. Standalone tool error result (no matching call id → renders on its own, error styling)
  {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: "call_orphan_err",
        response: { error: "Upstream provider timed out after 30s" },
        _provider_metadata: { _known_fields: { toolName: "fetch_invoices", isError: true } },
      },
    ],
  },

  // 9. Assistant refusal (isRefusal known field → refusal badge)
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

  // 10. Assistant with an unknown part type (default JSON fallback block)
  {
    role: "assistant",
    parts: [
      { type: "text", content: "And here's a part type the renderer doesn't know about:" },
      { type: "custom_widget", payload: { kind: "chart", series: [1, 2, 3] } } as never,
    ],
  },
] as GenAIMessage[]

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
            A full conversation exercising every message role and content part: system instructions, user and assistant
            messages, text, reasoning, media (image / audio / video as blob and uri), file references, tool calls and
            results, refusals, and unknown part types. Broken media sources are included to show fallback behavior.
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

        <div className={`rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${pageSurfaceClass}`}>
          <Conversation messages={DEMO_MESSAGES} />
        </div>
      </div>
    </main>
  )
}
