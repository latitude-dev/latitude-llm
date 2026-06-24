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

export const Route = createFileRoute("/design-system/$component")({
  component: ComponentPage,
})

type ComponentEntry = {
  title: string
  description: string
  Demo: () => ReactNode
}

const COMPONENT_REGISTRY: Record<string, ComponentEntry> = {
  alert: {
    title: "Alert",
    description: "Inline feedback banners with semantic variants.",
    Demo: AlertDemo,
  },
  avatar: {
    title: "Avatar",
    description: "Hash-colored initials, optional image, and stacked groups.",
    Demo: AvatarDemo,
  },
  badge: {
    title: "Badge",
    description: "Compact labels for status and metadata.",
    Demo: BadgeDemo,
  },
  checkbox: {
    title: "Checkbox",
    description: "Selection control with indeterminate state.",
    Demo: CheckboxDemo,
  },
  "copy-button": {
    title: "Copy button",
    description: "Clipboard copy with feedback.",
    Demo: CopyButtonDemo,
  },
  "date-range-picker": {
    title: "Date range picker",
    description: "Calendar popover with presets.",
    Demo: DateRangePickerDemo,
  },
  forms: {
    title: "Forms",
    description: "Input, label, and form field composition.",
    Demo: FormsDemo,
  },
  "rich-text-editor": {
    title: "Rich text editor",
    description: "Lazy-loaded CodeMirror editor with JSON detection.",
    Demo: RichTextEditorDemo,
  },
  status: {
    title: "Status",
    description: "Compact pill statuses with semantic variants.",
    Demo: StatusDemo,
  },
  charts: {
    title: "Charts",
    description: "ECharts bar chart and loading skeletons.",
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
      <entry.Demo />
    </DesignSystemPage>
  )
}

function AlertDemo() {
  return (
    <>
      <ComponentDemoSection title="Default" description="General information for the user.">
        <Alert title="Default alert" description="General information for the user." />
      </ComponentDemoSection>
      <ComponentDemoSection title="Success" description="Positive confirmation after a completed action.">
        <Alert variant="success" title="Success" description="Your changes were saved." />
      </ComponentDemoSection>
      <ComponentDemoSection title="Warning" description="Caution before a potentially impactful action.">
        <Alert variant="warning" title="Warning" description="This action may affect billing." />
      </ComponentDemoSection>
      <ComponentDemoSection title="Destructive" description="Error or failure state.">
        <Alert variant="destructive" title="Error" description="Something went wrong. Try again." />
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
      <Checkbox checked={checked} onCheckedChange={setChecked} />
    </ComponentDemoSection>
  )
}

function CopyButtonDemo() {
  return (
    <>
      <ComponentDemoSection title="Plain text" description="Copies a short string to the clipboard.">
        <CopyButton value="Hello, world!" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Identifier" description="Copies a longer identifier value.">
        <CopyButton value="cuid_abc123def456" />
      </ComponentDemoSection>
    </>
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
    <>
      <ComponentDemoSection title="Neutral" description="Default status without semantic color.">
        <Status label="Neutral" variant="neutral" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Info" description="Informational status.">
        <Status label="Info" variant="info" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Success" description="Positive or healthy status.">
        <Status label="Success" variant="success" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Warning" description="Attention-needed status.">
        <Status label="Warning" variant="warning" />
      </ComponentDemoSection>
      <ComponentDemoSection title="Destructive" description="Error or critical status.">
        <Status label="Destructive" variant="destructive" />
      </ComponentDemoSection>
      <ComponentDemoSection
        title="Truncation"
        description="Long labels truncate cleanly in constrained layouts."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-64">
          <Status label="This is a longer status label that truncates cleanly in constrained layouts" variant="info" />
        </div>
      </ComponentDemoSection>
    </>
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
      <ComponentDemoSection
        title="With presets"
        description="Calendar popover with quick-select ranges."
        frameClassName="block"
      >
        <div className="mx-auto w-full max-w-md">
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
