import { Badge } from "@repo/ui"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ArrowUpRight, CircleAlert, Sparkles } from "lucide-react"

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: {
    children: "At least 99.7% priced",
    variant: "accent",
    size: "normal",
    shape: "rounded",
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "yellow",
        "purple",
        "accent",
        "success",
        "successMuted",
        "destructive",
        "destructiveMuted",
        "warningMuted",
        "muted",
        "outline",
        "outlineMuted",
        "outlineAccent",
        "outlinePurple",
        "outlineSuccessMuted",
        "outlineDestructiveMuted",
        "outlineWarningMuted",
        "white",
      ],
    },
    size: {
      control: "select",
      options: ["small", "normal", "large"],
    },
    shape: {
      control: "select",
      options: ["default", "rounded"],
    },
  },
} satisfies Meta<typeof Badge>

export default meta

type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const FilledStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge variant="successMuted" shape="rounded" indicatorProps={{ color: "success" }}>
        Healthy
      </Badge>
      <Badge variant="warningMuted" shape="rounded" iconProps={{ icon: CircleAlert, placement: "start" }}>
        Medium
      </Badge>
      <Badge variant="accent" shape="rounded" iconProps={{ icon: Sparkles, placement: "start" }}>
        Auto-generated
      </Badge>
      <Badge variant="destructiveMuted" shape="rounded">
        Incident open
      </Badge>
    </div>
  ),
}

export const OutlineStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge variant="outlineMuted" shape="rounded">
        Fading
      </Badge>
      <Badge variant="outlineAccent" shape="rounded" iconProps={{ icon: ArrowUpRight, placement: "end" }}>
        Linked target
      </Badge>
      <Badge variant="outlineSuccessMuted" shape="rounded">
        Active
      </Badge>
    </div>
  ),
}
