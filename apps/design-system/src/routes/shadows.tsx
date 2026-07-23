import { boxShadow, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { DemoFrame } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { TypographySection } from "./-components/typography-table.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/shadows")({
  component: ShadowsPage,
})

const SHADOW_SAMPLES = (Object.entries(boxShadow) as [keyof typeof boxShadow, string][]).filter(
  ([token]) => token !== "none",
)

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
            "<div className={boxShadow.md} />",
            '// or: className="shadow-md"',
          ]}
        />
      </UsageSection>

      <TypographySection title="Scale" description="Every elevation token, from lowest to highest.">
        <DemoFrame className="flex-wrap gap-6">
          {SHADOW_SAMPLES.map(([token, className]) => (
            <div key={token} className="flex flex-col items-center gap-3">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-lg border border-border/60 bg-card ${className}`}
              />
              <Text.H7 color="foregroundMuted">{token}</Text.H7>
            </div>
          ))}
        </DemoFrame>
      </TypographySection>
    </DesignSystemPage>
  )
}
