import { Input } from "@repo/ui"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Primitives/Input",
  component: Input,
  args: {
    label: "Project name",
    placeholder: "support-agent-prod",
    description: "Used across breadcrumbs, URLs, and internal monitors.",
    background: "background",
    size: "default",
  },
  argTypes: {
    background: {
      control: "select",
      options: ["transparent", "background"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
    },
  },
} satisfies Meta<typeof Input>

export default meta

type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const ErrorState: Story = {
  args: {
    value: "acme sandbox",
    errors: ["Use lowercase letters, numbers, and hyphens only."],
  },
}

export const InlineField: Story = {
  args: {
    inline: true,
    label: "Date range",
    description: "Controls the comparison window in monitor charts.",
    placeholder: "Last 24 hours",
  },
}
