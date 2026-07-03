import type { CheckedState } from "@repo/ui"
import {
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  BarChart,
  ChartSkeleton,
  Checkbox,
  CopyButton,
  type DateRange,
  DateRangePicker,
  FormField,
  HistogramSkeleton,
  Input,
  Label,
  RichTextEditor,
  Status,
  Text,
} from "@repo/ui"
import { createFileRoute, notFound } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useState } from "react"
import { ComponentDemoSection } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { useDesignSystemTheme } from "./-components/design-system-theme.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/design-system/$component")({
  component: ComponentPage,
})

type ComponentUsage = {
  description: string
  lines: readonly string[]
}

type ComponentEntry = {
  title: string
  description: string
  usage: ComponentUsage
  Demo: () => ReactNode
}

const COMPONENT_REGISTRY: Record<string, ComponentEntry> = {
  alert: {
    title: "Alert",
    description: "Inline feedback banners with semantic variants.",
    usage: {
      description: "Import Alert from @repo/ui for inline page-level feedback.",
      lines: [
        'import { Alert } from "@repo/ui"',
        "",
        '<Alert title="Heads up" description="Your changes were saved." />',
        '<Alert variant="destructive" title="Error" description="Something went wrong." />',
      ],
    },
    Demo: AlertDemo,
  },
  avatar: {
    title: "Avatar",
    description: "Hash-colored initials, optional image, and stacked groups.",
    usage: {
      description: "Avatar renders initials from a name hash. AvatarGroup stacks multiple avatars with overflow.",
      lines: [
        'import { Avatar, AvatarGroup } from "@repo/ui"',
        "",
        '<Avatar name="Ada Lovelace" size="md" />',
        '<AvatarGroup size="md" items={[{ id: "1", name: "Alex Rivera" }]} />',
      ],
    },
    Demo: AvatarDemo,
  },
  badge: {
    title: "Badge",
    description: "Compact labels for status and metadata.",
    usage: {
      description: "Use Badge for compact categorical labels. Do not wrap label text in Text.",
      lines: ['import { Badge } from "@repo/ui"', "", '<Badge variant="outline">live</Badge>'],
    },
    Demo: BadgeDemo,
  },
  checkbox: {
    title: "Checkbox",
    description: "Selection control with indeterminate state.",
    usage: {
      description: "Control Checkbox with checked and onCheckedChange. Supports boolean and indeterminate states.",
      lines: ['import { Checkbox } from "@repo/ui"', "", "<Checkbox checked={checked} onCheckedChange={setChecked} />"],
    },
    Demo: CheckboxDemo,
  },
  "copy-button": {
    title: "Copy button",
    description: "Clipboard copy with feedback.",
    usage: {
      description: "CopyButton copies a string value and shows toast feedback on success.",
      lines: ['import { CopyButton } from "@repo/ui"', "", '<CopyButton value="cuid_abc123" />'],
    },
    Demo: CopyButtonDemo,
  },
  "date-range-picker": {
    title: "Date range picker",
    description: "Calendar popover with presets.",
    usage: {
      description: "Control the picker with value, selectedPresetId, and onChange.",
      lines: [
        'import { DateRangePicker } from "@repo/ui"',
        "",
        "<DateRangePicker",
        "  value={range}",
        "  presets={presets}",
        "  selectedPresetId={selectedPresetId}",
        "  onChange={({ range }) => setRange(range)}",
        "/>",
      ],
    },
    Demo: DateRangePickerDemo,
  },
  forms: {
    title: "Forms",
    description: "Input, label, and form field composition.",
    usage: {
      description: "Compose Input with an optional label prop, or wrap with FormField for descriptions and errors.",
      lines: [
        'import { FormField, Input, Label, Text } from "@repo/ui"',
        "",
        '<Input label={<Text.H6>Email</Text.H6>} name="email" type="email" />',
        "<FormField label={...} errors={[...]}>",
        '  <Input name="workspace" aria-invalid="true" />',
        "</FormField>",
      ],
    },
    Demo: FormsDemo,
  },
  "rich-text-editor": {
    title: "Rich text editor",
    description: "Lazy-loaded CodeMirror editor with JSON detection.",
    usage: {
      description: "RichTextEditor is a controlled component. JSON content is auto-detected and highlighted.",
      lines: [
        'import { RichTextEditor } from "@repo/ui"',
        "",
        '<RichTextEditor value={value} onChange={setValue} minHeight="120px" />',
      ],
    },
    Demo: RichTextEditorDemo,
  },
  status: {
    title: "Status",
    description: "Compact pill statuses with semantic variants.",
    usage: {
      description: "Status renders a leading dot and label. Long labels truncate in constrained layouts.",
      lines: ['import { Status } from "@repo/ui"', "", '<Status label="Healthy" variant="success" />'],
    },
    Demo: StatusDemo,
  },
  charts: {
    title: "Charts",
    description: "ECharts bar chart and loading skeletons.",
    usage: {
      description: "BarChart reads theme colors from CSS variables. Use skeletons while data loads.",
      lines: [
        'import { BarChart, ChartSkeleton } from "@repo/ui"',
        "",
        '<BarChart data={[{ category: "Mon", value: 120 }]} height={200} ariaLabel="Requests" />',
        "<ChartSkeleton minHeight={160} />",
      ],
    },
    Demo: ChartsDemo,
  },
}

function ComponentPage() {
  const { component } = Route.useParams()
  const entry = COMPONENT_REGISTRY[component]

  if (!entry) {
    throw notFound()
  }

  return (
    <DesignSystemPage eyebrow="Components" title={entry.title} description={entry.description} wide>
      <UsageSection description={entry.usage.description}>
        <UsageCode lines={entry.usage.lines} />
      </UsageSection>
      <entry.Demo />
    </DesignSystemPage>
  )
}

function AlertDemo() {
  return (
    <>
      <ComponentDemoSection title="Default" description="General information for the user.">
        <div className="w-full max-w-xl">
          <Alert title="Default alert" description="General information for the user." />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection title="Success" description="Positive confirmation after a completed action.">
        <div className="w-full max-w-xl">
          <Alert variant="success" title="Success" description="Your changes were saved." />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection title="Warning" description="Caution before a potentially impactful action.">
        <div className="w-full max-w-xl">
          <Alert variant="warning" title="Warning" description="This action may affect billing." />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection title="Destructive" description="Error or failure state.">
        <div className="w-full max-w-xl">
          <Alert variant="destructive" title="Error" description="Something went wrong. Try again." />
        </div>
      </ComponentDemoSection>
    </>
  )
}

function AvatarDemo() {
  return (
    <>
      <ComponentDemoSection title="Small" description="Compact avatar for dense lists and metadata rows.">
        <Avatar name="Ada Lovelace" size="sm" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Medium" description="Default avatar scale for comments and assignees.">
        <Avatar name="Grace Hopper" size="md" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Large" description="Prominent avatar for profile headers.">
        <Avatar name="Margaret Hamilton" size="lg" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Avatar group" description="Stacked avatars with overflow count.">
        <AvatarGroup
          size="md"
          items={[
            { id: "1", name: "Alex Rivera" },
            { id: "2", name: "Sam Chen" },
            { id: "3", name: "Jordan Lee" },
            { id: "4", name: "Taylor Kim" },
            { id: "5", name: "Riley Patel" },
          ]}
        />
      </ComponentDemoSection>
    </>
  )
}

function BadgeDemo() {
  return (
    <>
      <ComponentDemoSection title="Outline" description="Bordered badge for live or categorical labels.">
        <Badge variant="outline" size="small" uppercase noWrap>
          live
        </Badge>
      </ComponentDemoSection>
      <ComponentDemoSection title="Default" description="Filled default badge.">
        <Badge variant="default">Default</Badge>
      </ComponentDemoSection>
      <ComponentDemoSection title="Secondary" description="Muted secondary badge.">
        <Badge variant="secondary">Secondary</Badge>
      </ComponentDemoSection>
    </>
  )
}

function CheckboxDemo() {
  const [checked, setChecked] = useState<CheckedState>(false)

  return (
    <ComponentDemoSection
      title="Checkbox"
      description="Selection control with checked, unchecked, and indeterminate states."
    >
      <div className="flex items-center gap-2">
        <Checkbox id="checkbox-demo" checked={checked} onCheckedChange={setChecked} />
        <Label htmlFor="checkbox-demo">
          <Text.H6>Checkbox</Text.H6>
        </Label>
      </div>
    </ComponentDemoSection>
  )
}

function CopyButtonDemo() {
  return (
    <ComponentDemoSection title="Copy button" description="Copies a value to the clipboard with feedback.">
      <CopyButton value="Hello, world!" />
    </ComponentDemoSection>
  )
}

function FormsDemo() {
  const inputId = "design-system-forms-manual"

  return (
    <>
      <ComponentDemoSection
        title="Input with label"
        description="Email field using the Input label prop."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-md">
          <Input
            label={<Text.H6>Email</Text.H6>}
            name="email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="hello@latitude.so…"
          />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection
        title="Form field with errors"
        description="FormField wraps the input with description and validation messages."
        frameClassName="block"
      >
        <FormField
          className="mx-auto w-full max-w-md"
          label={<Text.H6>Workspace Name</Text.H6>}
          description={<Text.H6 color="foregroundMuted">Used across your tenant settings.</Text.H6>}
          errors={["Use at least 3 characters."]}
        >
          <Input name="workspaceName" autoComplete="off" placeholder="Acme Inc.…" aria-invalid="true" />
        </FormField>
      </ComponentDemoSection>
      <ComponentDemoSection
        title="Manual label"
        description="Label and Input composed separately."
        frameClassName="block"
      >
        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          <Label htmlFor={inputId}>
            <Text.H6>Manual Label + Input</Text.H6>
          </Label>
          <Input id={inputId} name={inputId} autoComplete="off" placeholder="Custom field…" />
        </div>
      </ComponentDemoSection>
    </>
  )
}

function StatusDemo() {
  return (
    <ComponentDemoSection title="Variants" description="Semantic status variants.">
      <div className="flex flex-wrap gap-4">
        <Status label="Neutral" variant="neutral" />
        <Status label="Info" variant="info" />
        <Status label="Success" variant="success" />
        <Status label="Warning" variant="warning" />
        <Status label="Destructive" variant="destructive" />
      </div>
    </ComponentDemoSection>
  )
}

function RichTextEditorDemo() {
  const [jsonValue, setJsonValue] = useState('{\n  "name": "Latitude",\n  "type": "platform"\n}')
  const [textValue, setTextValue] = useState("Hello, world!\nThis is plain text content.")

  return (
    <>
      <ComponentDemoSection
        title="JSON content"
        description="Auto-detected and syntax-highlighted."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-2xl">
          <RichTextEditor value={jsonValue} onChange={setJsonValue} minHeight="120px" />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection
        title="Plain text"
        description="Default editor mode for unstructured content."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-2xl">
          <RichTextEditor value={textValue} onChange={setTextValue} minHeight="100px" />
        </div>
      </ComponentDemoSection>
    </>
  )
}

function ChartsDemo() {
  const { theme } = useDesignSystemTheme()

  return (
    <>
      <ComponentDemoSection
        title="Bar chart"
        description="ECharts bar chart with CSS-variable theming."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-xl">
          <BarChart
            colorScheme={theme}
            height={200}
            ariaLabel="Sample requests per day"
            data={[
              { category: "Mon", value: 120 },
              { category: "Tue", value: 84 },
              { category: "Wed", value: 162 },
              { category: "Thu", value: 95 },
              { category: "Fri", value: 140 },
            ]}
          />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection title="Chart skeleton" description="Loading placeholder for charts." frameClassName="block">
        <div className="mx-auto w-full max-w-xl">
          <ChartSkeleton minHeight={160} />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection
        title="Histogram skeleton"
        description="Loading placeholder for histograms."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-xl">
          <HistogramSkeleton height={160} />
        </div>
      </ComponentDemoSection>
    </>
  )
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfLocalDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function subtractDays(days: number): Date {
  const next = new Date()
  next.setDate(next.getDate() - days)
  return next
}

function formatRangePreview(range?: DateRange) {
  if (range?.from && range?.to) {
    return `${range.from.toLocaleString()} - ${range.to.toLocaleString()}`
  }
  if (range?.from) return `From ${range.from.toLocaleString()}`
  if (range?.to) return `Until ${range.to.toLocaleString()}`
  return "No range selected"
}

function DateRangePickerDemo() {
  const presets = [
    {
      id: "today",
      label: "Today",
      range: { from: startOfLocalDay(new Date()), to: endOfLocalDay(new Date()) },
    },
    {
      id: "last-7-days",
      label: "Last 7 days",
      range: { from: startOfLocalDay(subtractDays(7)), to: endOfLocalDay(new Date()) },
    },
    {
      id: "last-30-days",
      label: "Last 30 days",
      range: { from: startOfLocalDay(subtractDays(30)), to: endOfLocalDay(new Date()) },
    },
  ] as const
  const [range, setRange] = useState<DateRange | undefined>(presets[1].range)
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(presets[1].id)

  return (
    <>
      <ComponentDemoSection title="With presets" description="Calendar popover with quick-select ranges.">
        <div className="max-w-md">
          <DateRangePicker
            value={range}
            presets={presets}
            selectedPresetId={selectedPresetId}
            placeholder="All time"
            onChange={({ range: nextRange, source, presetId }) => {
              setRange(nextRange)
              setSelectedPresetId(source === "preset" ? presetId : undefined)
            }}
          />
        </div>
      </ComponentDemoSection>
      <ComponentDemoSection title="Selected range" description="Preview of the currently selected date range.">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <Text.H6 color="foregroundMuted">{formatRangePreview(range)}</Text.H6>
        </div>
      </ComponentDemoSection>
    </>
  )
}
