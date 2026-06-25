import { boxShadow, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ComponentDemoSection } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/design-system/shadows")({
  component: ShadowsPage,
})

const SHADOW_SAMPLES = Object.entries(boxShadow) as [keyof typeof boxShadow, string][]

function ShadowsPage() {
  return (
    <DesignSystemPage
      eyebrow="Product"
      title="Shadows"
      description="Elevation tokens from @repo/ui for cards, popovers, and overlays."
      wide
    >
      <UsageSection description="Import boxShadow from @repo/ui and apply the token as a className on any surface.">
        <UsageCode
          lines={[
            'import { boxShadow } from "@repo/ui"',
            "",
            '<div className={boxShadow.md} />',
            '// or: className="shadow-md"',
          ]}
        />
      </UsageSection>

      {SHADOW_SAMPLES.map(([token, className]) => (
        <ComponentDemoSection key={token} title={token} description={`boxShadow.${token} — ${className}`}>
          <div className={`rounded-lg border border-border/60 bg-card px-8 py-6 ${className}`}>
            <Text.H5 weight="semibold">{token}</Text.H5>
          </div>
        </ComponentDemoSection>
      ))}
    </DesignSystemPage>
  )
}
