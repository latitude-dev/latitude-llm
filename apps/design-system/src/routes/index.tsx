import { Icon, Text } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Boxes, Layers, Palette, SunMoon, Type } from "lucide-react"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { DESIGN_SYSTEM_NAV } from "./-components/nav-config.ts"
import { TypographySection } from "./-components/typography-table.tsx"

export const Route = createFileRoute("/")({
  component: AboutPage,
})

const PRODUCT_CARDS = [
  {
    title: "Colors",
    description: "Semantic color tokens for light and dark themes.",
    to: "/colors",
    icon: Palette,
  },
  {
    title: "Typography",
    description: "Type scale, weights, and font families.",
    to: "/typography",
    icon: Type,
  },
  {
    title: "Spacing",
    description: "Layout spacing scale used across the product.",
    to: "/spacing",
    icon: Layers,
  },
  {
    title: "Shadows",
    description: "Elevation tokens for cards and overlays.",
    to: "/shadows",
    icon: SunMoon,
  },
  {
    title: "Icons",
    description: "Lucide wrapper, brand icons, and provider logos.",
    to: "/icons",
    icon: Boxes,
  },
] as const

function AboutPage() {
  const componentSection = DESIGN_SYSTEM_NAV.find((section) => section.label === "Components")

  return (
    <DesignSystemPage
      eyebrow="General"
      title="About"
      description="The design system behind Latitude's console. Browse product tokens and components — toggle light/dark mode from the sidebar to validate visual parity."
      wide
    >
      <TypographySection title="Product" description="Design tokens for color, type, spacing, elevation, and icons.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_CARDS.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-background p-5 transition-colors hover:border-border hover:bg-muted/20"
            >
              <div className="flex items-center gap-2">
                <Icon icon={card.icon} size="sm" color="accentForeground" />
                <Text.H5 weight="semibold">{card.title}</Text.H5>
              </div>
              <Text.H6 color="foregroundMuted">{card.description}</Text.H6>
              <span className="inline-flex items-center gap-1 text-sm text-accent-foreground group-hover:underline">
                Explore
                <Icon icon={ArrowRight} size="sm" />
              </span>
            </Link>
          ))}
        </div>
      </TypographySection>

      <TypographySection title="Components" description="Interactive UI building blocks.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {componentSection?.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg border border-border/60 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/30 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </TypographySection>
    </DesignSystemPage>
  )
}
