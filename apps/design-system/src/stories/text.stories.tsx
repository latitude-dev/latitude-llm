import { Text } from "@repo/ui"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Primitives/Text",
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Scale: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-3">
      <Text.H2>Section header</Text.H2>
      <Text.H4 color="foregroundMuted">
        Groups every session by what it was about, what the user wanted, and how the conversation ended.
      </Text.H4>
      <Text.H5M>Configuration</Text.H5M>
      <Text.H6 color="foregroundMuted">Monitor threshold</Text.H6>
      <Text.H7 uppercase color="foregroundMuted">
        Secondary metadata
      </Text.H7>
      <Text.Mono color="accentForeground">seed-large-conversation-3</Text.Mono>
    </div>
  ),
}

export const Clamping: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-2">
      <Text.H4 ellipsis>
        QA · Waiting (under threshold for now but intentionally very long to demonstrate truncation)
      </Text.H4>
      <Text.H5 color="foregroundMuted" lineClamp={3}>
        The shared section header description should stay readable, respect width constraints, and gracefully clamp when
        a narrow container cannot comfortably fit the whole message in one block.
      </Text.H5>
    </div>
  ),
}
