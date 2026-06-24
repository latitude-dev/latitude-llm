import { AnthropicIcon, GitHubIcon, GoogleIcon, Icon, LatitudeLogo, OpenaiIcon, VercelIcon } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { Check, Palette, Sparkles } from "lucide-react"
import { ComponentDemoSection } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"

export const Route = createFileRoute("/design-system/icons")({
  component: IconsPage,
})

const LUCIDE_SIZES = [
  { size: "xs", description: "12px — inline with compact text." },
  { size: "sm", description: "16px — buttons and list rows." },
  { size: "default", description: "20px — default inline icon." },
  { size: "md", description: "24px — section headers and cards." },
  { size: "lg", description: "32px — empty states and highlights." },
] as const

const LUCIDE_COLORS = [
  { color: "primary", description: "Primary brand color." },
  { color: "foreground", description: "Default text color." },
  { color: "foregroundMuted", description: "Secondary text color." },
  { color: "success", description: "Positive semantic color." },
  { color: "destructive", description: "Error semantic color." },
  { color: "accentForeground", description: "Accent text on accent surfaces." },
] as const

const BRAND_ICONS = [
  { name: "GoogleIcon", description: "Google OAuth sign-in.", Icon: GoogleIcon },
  { name: "GitHubIcon", description: "GitHub OAuth sign-in.", Icon: GitHubIcon },
  { name: "LatitudeLogo", description: "Latitude product logo mark.", Icon: LatitudeLogo },
] as const

const PROVIDER_ICONS = [
  { name: "OpenAI", description: "OpenAI provider icon.", Icon: OpenaiIcon },
  { name: "Anthropic", description: "Anthropic provider icon.", Icon: AnthropicIcon },
  { name: "Vercel", description: "Vercel provider icon.", Icon: VercelIcon },
] as const

function IconsPage() {
  return (
    <DesignSystemPage
      eyebrow="Product"
      title="Icons"
      description="Lucide wrapper for consistent sizing and color tokens, plus brand and provider icons from @repo/ui."
      wide
    >
      {LUCIDE_SIZES.map(({ size, description }) => (
        <ComponentDemoSection key={size} title={size} description={description}>
          <Icon icon={Sparkles} size={size} />
        </ComponentDemoSection>
      ))}

      {LUCIDE_COLORS.map(({ color, description }) => (
        <ComponentDemoSection key={color} title={color} description={description}>
          <Icon icon={Check} color={color} />
        </ComponentDemoSection>
      ))}

      {BRAND_ICONS.map(({ name, description, Icon: BrandIcon }) => (
        <ComponentDemoSection key={name} title={name} description={description}>
          <BrandIcon className="h-6 w-6" />
        </ComponentDemoSection>
      ))}

      {PROVIDER_ICONS.map(({ name, description, Icon: ProviderIconComponent }) => (
        <ComponentDemoSection key={name} title={name} description={description}>
          <ProviderIconComponent className="h-6 w-6" />
        </ComponentDemoSection>
      ))}

      <ComponentDemoSection
        title="More providers"
        description="40+ provider icons ship in @repo/ui — import from @repo/ui for LLM and infra providers."
      >
        <Icon icon={Palette} size="md" color="foregroundMuted" />
      </ComponentDemoSection>
    </DesignSystemPage>
  )
}
