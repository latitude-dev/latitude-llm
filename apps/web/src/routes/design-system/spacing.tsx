import { Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { TypographySection } from "./-components/typography-table.tsx"

export const Route = createFileRoute("/design-system/spacing")({
  component: SpacingPage,
})

const SPACING_SCALE = [
  { token: "0", value: "0px", className: "w-0" },
  { token: "0.5", value: "2px", className: "w-0.5" },
  { token: "1", value: "4px", className: "w-1" },
  { token: "1.5", value: "6px", className: "w-1.5" },
  { token: "2", value: "8px", className: "w-2" },
  { token: "2.5", value: "10px", className: "w-2.5" },
  { token: "3", value: "12px", className: "w-3" },
  { token: "4", value: "16px", className: "w-4" },
  { token: "5", value: "20px", className: "w-5" },
  { token: "6", value: "24px", className: "w-6" },
  { token: "8", value: "32px", className: "w-8" },
  { token: "10", value: "40px", className: "w-10" },
  { token: "12", value: "48px", className: "w-12" },
  { token: "16", value: "64px", className: "w-16" },
  { token: "20", value: "80px", className: "w-20" },
  { token: "24", value: "96px", className: "w-24" },
] as const

function SpacingPage() {
  return (
    <DesignSystemPage
      eyebrow="Product"
      title="Spacing"
      description="Tailwind spacing scale used for padding, margin, and gap. Values map to rem-based spacing utilities."
      wide
    >
      <TypographySection title="Scale" description="Visual reference for each spacing token.">
        <div className="overflow-hidden rounded-xl border border-border/70">
          {SPACING_SCALE.map(({ token, value, className }) => (
            <div key={token} className="flex items-center gap-6 border-b border-border px-5 py-5 last:border-b-0">
              <div className="flex w-24 shrink-0 flex-col gap-0.5">
                <Text.Mono size="h6">{token}</Text.Mono>
                <Text.H7 color="foregroundMuted">{value}</Text.H7>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className={`h-3 shrink-0 rounded-sm bg-primary ${className}`} />
                <Text.H6 color="foregroundMuted">
                  p-{token} · gap-{token} · m-{token}
                </Text.H6>
              </div>
            </div>
          ))}
        </div>
      </TypographySection>
    </DesignSystemPage>
  )
}
