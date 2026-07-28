import { Conversation, type GenAIMessage, type SubagentToolCallInfo } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ComponentDemoSection } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/chat")({
  component: ChatPage,
})

// A tiny inline SVG (base64) so the "working image" case renders without any network access.
const IMAGE_BLOB_B64 =
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNDAiIGhlaWdodD0iMTQwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNjM2NmYxIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZWM0ODk5Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjI0MCIgaGVpZ2h0PSIxNDAiIHJ4PSIxMiIgZmlsbD0idXJsKCNnKSIvPjx0ZXh0IHg9IjEyMCIgeT0iNzgiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjIwIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+aW1hZ2UgYmxvYjwvdGV4dD48L3N2Zz4="
// A small CSV (base64) used to demonstrate downloading an inline blob document.
const CSV_BLOB_B64 = "bmFtZSxzY29yZQpBbGljZSw5CkJvYiw3CkNhcm9sLDgK"
// Minimal PDF (base64). Also used with a wrong producer modality (`image`) to show mime-aware UX.
// It has no content stream, so it renders as a blank page — use RENDERABLE_PDF_B64 to see pixels.
const PDF_BLOB_B64 =
  "JVBERi0xLjAKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIF0vQ291bnQgMT4+CmVuZG9iagozIDAgb2JqCjw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFI+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwMDU2IDAwMDAwIG4KMDAwMDAwMDExNSAwMDAwMCBuCnRyYWlsZXIKPDwvU2l6ZSA0L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMTUzCiUlRU9G"
// A real 306x396 PDF drawing Helvetica text and a filled rect, for the inline preview thumbnail.
const RENDERABLE_PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMzA2IDM5Nl0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDQgMCBSPj4+Pi9Db250ZW50cyA1IDAgUj4+ZW5kb2JqCjQgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iago1IDAgb2JqPDwvTGVuZ3RoIDE4Mj4+c3RyZWFtCkJUIC9GMSAyMCBUZiAzMCAzMzAgVGQgKExhdGl0dWRlKSBUaiBFVApCVCAvRjEgMTIgVGYgMzAgMzA1IFRkIChJbmxpbmUgUERGIHByZXZpZXcgZml4dHVyZSkgVGogRVQKMC4xNSAwLjM5IDAuOTIgcmcgMzAgNDAgMjQ2IDI0MCByZSBmCjEgMSAxIHJnIEJUIC9GMSAxNCBUZiA1MCAxNTAgVGQgKFBhZ2UgMSkgVGogRVQKZW5kc3RyZWFtZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDUyIDAwMDAwIG4gCjAwMDAwMDAxMDEgMDAwMDAgbiAKMDAwMDAwMDIxMSAwMDAwMCBuIAowMDAwMDAwMjcyIDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDYvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgo0OTkKJSVFT0YK"
// Valid base64, invalid PDF — exercises the corrupt-document error card.
const CORRUPT_PDF_B64 = "JVBERi0xLjQKY29ycnVwdCBub3QgYSBwZGYK"

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

const LONG_TEXT = `This is a long assistant response used to demonstrate how the renderer collapses oversized content behind a "show more" affordance, snapping to paragraph boundaries so the head and tail stay readable while the middle is hidden until expanded.`

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
      { type: "text", content: "A linked PDF (uri → Preview) and an inline CSV (blob → Download):" },
      { type: "uri", modality: "document", mime_type: "application/pdf", uri: "https://docs.latitude.so/guide.pdf" },
      { type: "blob", modality: "document", mime_type: "text/csv", content: CSV_BLOB_B64 },
    ],
  },
  {
    role: "user",
    parts: [
      {
        type: "text",
        content:
          "Inline PDF blob mis-tagged as image (as emitted by @ai-sdk/otel) — mime wins: FileCard with Download:",
      },
      { type: "blob", modality: "image", mime_type: "application/pdf", content: PDF_BLOB_B64 },
    ],
  },
  {
    role: "user",
    parts: [
      { type: "text", content: "Inline PDF blob that actually renders — thumbnail expands to the viewer:" },
      { type: "blob", modality: "document", mime_type: "application/pdf", content: RENDERABLE_PDF_B64 },
    ],
  },
  {
    role: "user",
    parts: [
      { type: "text", content: "Unreadable PDF blob — the preview falls back to an error card:" },
      { type: "blob", modality: "document", mime_type: "application/pdf", content: CORRUPT_PDF_B64 },
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
    description: "System, plain text, rich markdown, JSON blocks.",
    messages: TEXT_MESSAGES,
  },
  {
    title: "Media",
    description: "Image / audio / video, each with working and broken sources.",
    messages: MEDIA_MESSAGES,
  },
  {
    title: "Files & documents",
    description:
      "file_id references, a cross-origin PDF (Preview only), an inline CSV (Download), and inline PDF blobs with a rendered thumbnail, a blank page, and a corrupt document. Font and CMap assets are only served by apps/web, so exotic PDFs degrade here.",
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

const SUBAGENT_TOOL_CALLS: ReadonlyMap<string, SubagentToolCallInfo> = new Map([
  [
    "call_metrics_1",
    {
      label: "metrics-analyst",
      taskPreview: "Summarize p95 latency across providers for the last 7 days.",
      resultPreview: "OpenAI p95 is 412ms (above 400ms); Anthropic 380ms and the rest are within budget.",
      onOpenConversation: () => {},
    },
  ],
])

function ChatPage() {
  return (
    <DesignSystemPage
      eyebrow="Components"
      title="Chat / Conversation"
      description="Every message role and content part the renderer supports: text & markdown, media, files, tool calls, and edge-case roles."
      wide
    >
      <UsageSection description="Conversation renders a list of GenAI messages with role-aware styling and rich content parts.">
        <UsageCode lines={['import { Conversation } from "@repo/ui"', "", "<Conversation messages={messages} />"]} />
      </UsageSection>

      {SECTIONS.map((section) => (
        <ComponentDemoSection
          key={section.title}
          title={section.title}
          description={section.description}
          frameClassName="block"
        >
          <div className="mx-auto w-full max-w-3xl">
            <Conversation messages={section.messages} />
          </div>
        </ComponentDemoSection>
      ))}

      <ComponentDemoSection
        title="Subagent tool call"
        description="A tool call that spawned a subagent renders as a nested sub-conversation: the agent's request and reply as a chat peek, with an Open conversation affordance."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-3xl">
          <Conversation messages={TOOL_MESSAGES} subagentToolCalls={SUBAGENT_TOOL_CALLS} />
        </div>
      </ComponentDemoSection>
    </DesignSystemPage>
  )
}
