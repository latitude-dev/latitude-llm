import { Icon } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { Sparkles } from "lucide-react"
import { ComponentDemoSection } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/design-system/icons")({
  component: IconsPage,
})

function IconsPage() {
  return (
    <DesignSystemPage
      title="Icons"
      description="Lucide wrapper for consistent sizing and color tokens, plus brand and provider icons from @repo/ui."
    >
      <UsageSection description="Pass any lucide-react icon to Icon for consistent size and color tokens. Brand and provider icons export from @repo/ui directly.">
        <UsageCode
          lines={[
            'import { Icon, GoogleIcon } from "@repo/ui"',
            'import { Sparkles } from "lucide-react"',
            "",
            '<Icon icon={Sparkles} size="sm" color="foregroundMuted" />',
            '<GoogleIcon className="h-4 w-4" />',
          ]}
        />
      </UsageSection>

      <ComponentDemoSection title="Default" description="Default icon size and color.">
        <Icon icon={Sparkles} />
      </ComponentDemoSection>
    </DesignSystemPage>
  )
}
