import { Button, Icon } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { Check, Plus, Sparkles } from "lucide-react"
import type { ComponentProps } from "react"
import { ComponentDemoSection } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/design-system/button")({
  component: ButtonPage,
})

const VARIANTS = [
  { value: "default", label: "Default", description: "Primary call to action with filled styling." },
  {
    value: "default-soft",
    label: "Default soft",
    description: "Softer primary emphasis for secondary actions on busy surfaces.",
  },
  { value: "secondary", label: "Secondary", description: "Neutral filled button for supporting actions." },
  { value: "secondary-soft", label: "Secondary soft", description: "Muted secondary styling with less visual weight." },
  { value: "outline", label: "Outline", description: "Bordered button on neutral backgrounds." },
  { value: "ghost", label: "Ghost", description: "Minimal button with hover background only." },
  { value: "destructive", label: "Destructive", description: "Filled button for irreversible or dangerous actions." },
  { value: "destructive-outline", label: "Destructive outline", description: "Outlined destructive styling." },
  { value: "destructive-soft", label: "Destructive soft", description: "Muted destructive styling." },
  { value: "link", label: "Link", description: "Text-only button styled as an inline link." },
] as const satisfies ReadonlyArray<{
  value: NonNullable<ComponentProps<typeof Button>["variant"]>
  label: string
  description: string
}>

const SIZES = [
  { value: "sm", label: "Small", description: "Compact height for dense toolbars and tables." },
  { value: "default", label: "Default", description: "Standard size for forms and page actions." },
  { value: "lg", label: "Large", description: "Prominent size for hero CTAs and empty states." },
] as const satisfies ReadonlyArray<{
  value: NonNullable<ComponentProps<typeof Button>["size"]>
  label: string
  description: string
}>

function ButtonPage() {
  return (
    <DesignSystemPage
      eyebrow="Components"
      title="Button"
      description="Triggers actions and navigation. Use Button from @repo/ui for all clickable actions in the product."
      wide
    >
      <UsageSection description="Import Button from @repo/ui. Do not wrap labels in Text — Button sets typography internally.">
        <UsageCode
          lines={[
            'import { Button, Icon } from "@repo/ui"',
            'import { Plus } from "lucide-react"',
            "",
            '<Button variant="outline" size="sm">',
            '  <Icon icon={Plus} size="sm" />',
            "  Add item",
            "</Button>",
          ]}
        />
      </UsageSection>

      {VARIANTS.map(({ value, label, description }) => (
        <ComponentDemoSection key={value} title={label} description={description}>
          <Button variant={value}>
            <Icon icon={Sparkles} size="sm" />
            Set up
          </Button>
        </ComponentDemoSection>
      ))}

      {SIZES.map(({ value, label, description }) => (
        <ComponentDemoSection key={value} title={label} description={description}>
          <Button size={value}>
            <Icon icon={Sparkles} size="sm" />
            Set up
          </Button>
        </ComponentDemoSection>
      ))}

      <ComponentDemoSection title="Icon only" description="Square icon button. Always provide aria-label.">
        <Button size="icon" aria-label="Confirm">
          <Icon icon={Check} size="sm" />
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection title="Icon only outline" description="Outlined square icon button.">
        <Button size="icon" variant="outline" aria-label="Add">
          <Icon icon={Plus} size="sm" />
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection title="Icon only ghost" description="Ghost square icon button.">
        <Button size="icon" variant="ghost" aria-label="Set up">
          <Icon icon={Sparkles} size="sm" />
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection
        title="Full width"
        description="Stretches to the container width — common in mobile forms and dialogs."
      >
        <div className="w-full max-w-sm">
          <Button size="full">
            <Icon icon={Sparkles} size="sm" />
            Set up
          </Button>
        </div>
      </ComponentDemoSection>
    </DesignSystemPage>
  )
}
