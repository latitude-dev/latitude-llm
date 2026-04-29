import type { LucideProps } from "lucide-react"
import type { ComponentType } from "react"
import {
  AmazonQIcon,
  AzureIcon,
  ClaudeIcon,
  CloudflareIcon,
  CloudflareWorkersIcon,
  CohereIcon,
  CopilotIcon,
  DeepseekIcon,
  GeminiIcon,
  GitlabIcon,
  GrokIcon,
  GroqIcon,
  HuggingfaceIcon,
  KilocodeIcon,
  KimiIcon,
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
  TogetheraiIcon,
  V0Icon,
  VercelIcon,
} from "./icons/index.tsx"

type ProviderIconComponent = ComponentType<LucideProps>

// Providers from https://models.dev/
// Icons from https://svgl.app/
export const PROVIDER_ICON_MAP: Record<string, ProviderIconComponent> = {
  alibaba: QwenIcon,
  "alibaba-cn": QwenIcon,
  "amazon-bedrock": AmazonQIcon,
  anthropic: ClaudeIcon, // Alternative: AnthropicIcon
  azure: AzureIcon, // Alternative: OpenaiIcon
  "azure-cognitive-services": AzureIcon,
  "cloudflare-ai-gateway": CloudflareIcon,
  "cloudflare-workers-ai": CloudflareWorkersIcon,
  cohere: CohereIcon,
  deepseek: DeepseekIcon,
  "github-copilot": CopilotIcon,
  gitlab: GitlabIcon,
  google: GeminiIcon,
  "google-vertex": GeminiIcon,
  "google-vertex-anthropic": ClaudeIcon, // Alternative: AnthropicIcon
  groq: GroqIcon,
  huggingface: HuggingfaceIcon,
  kilo: KilocodeIcon,
  "kimi-for-coding": KimiIcon,
  llama: OllamaIcon,
  MetaIcon,
  mistral: MistralIcon,
  moonshotai: KimiIcon,
  "moonshotai-cn": KimiIcon,
  nvidia: NvidiaIcon,
  "ollama-cloud": OllamaIcon,
  openai: OpenaiIcon,
  opencode: OpencodeIcon,
  "opencode-go": OpencodeIcon,
  openrouter: OpenrouterIcon,
  perplexity: PerplexityIcon,
  replit: ReplitIcon,
  togetherai: TogetheraiIcon,
  v0: V0Icon,
  vercel: VercelIcon,
  xai: GrokIcon, // Alternative: XaiIcon
}
