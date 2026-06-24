import { Button, Icon, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { Check, Plus, Sparkles, Trash2 } from "lucide-react"
import type { ComponentProps } from "react"
import { ComponentDemoSection } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { TypographySection } from "./-components/typography-table.tsx"

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
      {VARIANTS.map(({ value, label, description }) => (
        <ComponentDemoSection key={value} title={label} description={description}>
          <Button variant={value}>{label}</Button>
        </ComponentDemoSection>
      ))}

      {SIZES.map(({ value, label, description }) => (
        <ComponentDemoSection key={value} title={label} description={description}>
          <Button size={value}>{label}</Button>
        </ComponentDemoSection>
      ))}

      <ComponentDemoSection
        title="Loading"
        description="Shows a spinner and blocks interaction while preserving layout."
      >
        <Button isLoading>Loading</Button>
      </ComponentDemoSection>

      <ComponentDemoSection title="Loading secondary" description="Loading state on a secondary variant.">
        <Button variant="secondary" isLoading>
          Loading
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection title="Disabled" description="Default variant with interaction blocked.">
        <Button disabled>Disabled</Button>
      </ComponentDemoSection>

      <ComponentDemoSection title="Disabled outline" description="Outlined variant with interaction blocked.">
        <Button variant="outline" disabled>
          Disabled
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection
        title="With icon"
        description="Icon before the label. Icons inherit button sizing and color tokens."
      >
        <Button>
          <Icon icon={Plus} size="sm" />
          Add item
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection title="With icon secondary" description="Secondary variant with a leading icon.">
        <Button variant="secondary">
          <Icon icon={Sparkles} size="sm" />
          Generate
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection title="With icon destructive" description="Destructive variant with a leading icon.">
        <Button variant="destructive">
          <Icon icon={Trash2} size="sm" />
          Delete
        </Button>
      </ComponentDemoSection>

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
        <Button size="icon" variant="ghost" aria-label="Delete">
          <Icon icon={Trash2} size="sm" />
        </Button>
      </ComponentDemoSection>

      <ComponentDemoSection
        title="Full width"
        description="Stretches to the container width — common in mobile forms and dialogs."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-sm">
          <Button size="full">Continue</Button>
        </div>
      </ComponentDemoSection>

      <TypographySection
        title="Usage"
        description="Import Button from @repo/ui. Do not wrap labels in Text — Button sets typography internally."
      >
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <Text.Mono display="block">{`<Button variant="outline" size="sm">`}</Text.Mono>
          <Text.Mono display="block">{`  <Icon icon={Plus} size="sm" />`}</Text.Mono>
          <Text.Mono display="block">{`  Add item`}</Text.Mono>
          <Text.Mono display="block">{`</Button>`}</Text.Mono>
        </div>
      </TypographySection>
    </DesignSystemPage>
  )
}
