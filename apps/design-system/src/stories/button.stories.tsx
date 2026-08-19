import { Button } from "@repo/ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ArrowRight, Plus } from "lucide-react"
import { HotkeyBadge } from "../../../web/src/components/hotkey-badge.tsx"

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: {
    children: "Create monitor",
    variant: "default",
    size: "default",
    disabled: false,
    isLoading: false,
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "destructive-outline",
        "secondary",
        "ghost",
        "link",
        "default-soft",
        "destructive-soft",
        "secondary-soft",
      ],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon", "icon-xs", "full"],
    },
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const WithLeadingIcon: Story = {
  args: {
    icon: Plus,
    children: "Add dataset",
    variant: "secondary",
  },
}

export const LoadingState: Story = {
  args: {
    isLoading: true,
    icon: ArrowRight,
    children: "Deploy changes",
  },
}

export const WithShortcut: Story = {
  args: {
    icon: Plus,
    children: "Filters",
    trailingAccessory: <HotkeyBadge hotkey="Mod+K" />,
    variant: "secondary",
  },
}

export const VariantShelf: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="default-soft">Default soft</Button>
      <Button variant="secondary-soft">Secondary soft</Button>
      <Button variant="destructive-soft">Destructive soft</Button>
    </div>
  ),
}
