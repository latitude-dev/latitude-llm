import type { CheckedState } from "@repo/ui"
import {
  Avatar,
  AvatarGroup,
  Badge,
  BarChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChartSkeleton,
  Checkbox,
  CopyButton,
  type DateRange,
  DateRangePicker,
  FormField,
  GitHubIcon,
  GoogleIcon,
  HistogramSkeleton,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Input,
  Label,
  LatitudeLogo,
  RichTextEditor,
  SplitButton,
  Status,
  Text,
  useMountEffect,
} from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Moon, Palette, PinIcon, Sparkles, Sun, Trash2 } from "lucide-react"
import { useState } from "react"
import { listingLayoutIntrinsicScroll } from "../../layouts/ListingLayout/index.tsx"

export const Route = createFileRoute("/design-system/")({
  component: DesignSystemPage,
})

function ShowcaseSection({
  title,
  description,
  theme,
  children,
}: {
  title: string
  description: string
  theme: "light" | "dark"
  children: React.ReactNode
}) {
  const surfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  return (
    <Card className={`relative overflow-hidden border-border/70 shadow-xl ${surfaceClass}`}>
      <CardHeader className="relative">
        <CardTitle>
          <Text.H4 className="text-balance">{title}</Text.H4>
        </CardTitle>
        <CardDescription>
          <Text.H6 color="foregroundMuted">{description}</Text.H6>
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">{children}</CardContent>
    </Card>
  )
}

function DesignSystemShowcase({ theme }: { theme: "light" | "dark" }) {
  const surfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  return (
    <div
      className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border/70 p-4 shadow-2xl sm:p-5 ${surfaceClass}`}
    >
      <div
        className={`relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3 ${surfaceClass}`}
      >
        <div className="flex items-center gap-2">
          <Icon icon={Palette} color="accentForeground" />
          <Text.H5 weight="semibold">{theme === "light" ? "Light Theme" : "Dark Theme"}</Text.H5>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border border-border/60 p-2 ${surfaceClass}`}>
          <LatitudeLogo className="h-5 w-5" />
          <Text.H6 color="foregroundMuted">@repo/ui</Text.H6>
        </div>
      </div>

      <ShowcaseSection theme={theme} title="Typography" description="Text scales and mono primitives.">
        <div className="flex flex-col gap-2">
          <Text.H1>Heading 1</Text.H1>
          <Text.H2>Heading 2</Text.H2>
          <Text.H3>Heading 3</Text.H3>
          <Text.H4>Heading 4</Text.H4>
          <Text.H5>Heading 5</Text.H5>
          <Text.H6>Heading 6</Text.H6>
          <Text.Mono>const status = "ready";</Text.Mono>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Avatar & AvatarGroup"
        description="Hash-colored initials, optional image, and stacked group with overflow."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Text.H6 weight="semibold">Sizes</Text.H6>
              <div className="flex items-center gap-3">
                <Avatar name="Ada Lovelace" size="sm" />
                <Avatar name="Grace Hopper" size="md" />
                <Avatar name="Margaret Hamilton" size="lg" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Text.H6 weight="semibold">Stacked ring (AvatarGroup)</Text.H6>
              <Avatar name="Queue assignee" size="md" stacked />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">AvatarGroup (3 visible + overflow)</Text.H6>
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
          </div>
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Badge uppercase</Text.H6>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" size="small" uppercase noWrap>
                live
              </Badge>
            </div>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Buttons" description="Sizes, variants, and states.">
        <div className="flex flex-col gap-6">
          <Link
            to="/design-system/button"
            className="inline-flex w-fit items-center gap-1 text-sm text-accent-foreground underline-offset-4 hover:underline"
          >
            Open button playground →
          </Link>
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Sizes (default variant)</Text.H6>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Icon only">
                <Icon icon={Check} size="sm" />
              </Button>
              <Button size="full">Full width</Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Variants</Text.H6>
            <div className="flex flex-wrap gap-3">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Sizes × Variants (sample)</Text.H6>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Text.H6 color="foregroundMuted" className="w-16 shrink-0">
                  sm
                </Text.H6>
                <Button size="sm">Default</Button>
                <Button size="sm" variant="secondary">
                  Secondary
                </Button>
                <Button size="sm" variant="outline">
                  Outline
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Text.H6 color="foregroundMuted" className="w-16 shrink-0">
                  lg
                </Text.H6>
                <Button size="lg">Default</Button>
                <Button size="lg" variant="secondary">
                  Secondary
                </Button>
                <Button size="lg" variant="outline">
                  Outline
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">States</Text.H6>
            <div className="flex flex-wrap gap-3">
              <Button isLoading>Loading…</Button>
              <Button variant="secondary" isLoading>
                Loading
              </Button>
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>
                Disabled
              </Button>
            </div>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="SplitButton"
        description="Primary action joined to a chevron menu of additional actions; per-action disabled is supported."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Variants</Text.H6>
            <div className="flex flex-wrap items-center gap-3">
              <SplitButton
                actions={[
                  { content: "Update", onClick: () => undefined },
                  { content: "Save as new", onClick: () => undefined },
                ]}
              />
              <SplitButton
                variant="default"
                actions={[
                  { content: "Update", onClick: () => undefined },
                  { content: "Save as new", onClick: () => undefined },
                ]}
              />
              <SplitButton
                variant="secondary"
                actions={[
                  { content: "Update", onClick: () => undefined },
                  { content: "Save as new", onClick: () => undefined },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">With per-action icons</Text.H6>
            <div className="flex flex-wrap items-center gap-3">
              <SplitButton
                actions={[
                  {
                    content: "Pin search",
                    icon: <Icon icon={PinIcon} size="sm" />,
                    onClick: () => undefined,
                  },
                  {
                    content: "Discard",
                    icon: <Icon icon={Trash2} size="sm" />,
                    onClick: () => undefined,
                  },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Mixed disabled (primary off, secondary still reachable via chevron)</Text.H6>
            <div className="flex flex-wrap items-center gap-3">
              <SplitButton
                actions={[
                  { content: "Update", onClick: () => undefined, disabled: true },
                  { content: "Save as new", onClick: () => undefined },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Fully disabled</Text.H6>
            <div className="flex flex-wrap items-center gap-3">
              <SplitButton
                disabled
                actions={[
                  { content: "Update", onClick: () => undefined },
                  { content: "Save as new", onClick: () => undefined },
                ]}
              />
            </div>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Forms" description="Input, label, and form field composition.">
        <div className="flex flex-col gap-4">
          <Input
            label={<Text.H6>Email</Text.H6>}
            name="email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="hello@latitude.so…"
          />
          <FormField
            label={<Text.H6>Workspace Name</Text.H6>}
            description={<Text.H6 color="foregroundMuted">Used across your tenant settings.</Text.H6>}
            errors={["Use at least 3 characters."]}
          >
            <Input name="workspaceName" autoComplete="off" placeholder="Acme Inc.…" aria-invalid="true" />
          </FormField>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`manual-input-${theme}`}>
              <Text.H6>Manual Label + Input</Text.H6>
            </Label>
            <Input
              id={`manual-input-${theme}`}
              name={`manual-input-${theme}`}
              autoComplete="off"
              placeholder="Custom field…"
            />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Date Range Picker"
        description="V1-inspired calendar popover with presets, adapted to the v2 design system."
      >
        <DateRangePickerShowcase />
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Status"
        description="Compact pill statuses with semantic variants and a leading dot."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Status label="Neutral" variant="neutral" />
            <Status label="Info" variant="info" />
            <Status label="Success" variant="success" />
            <Status label="Warning" variant="warning" />
            <Status label="Destructive" variant="destructive" />
          </div>
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">Truncation</Text.H6>
            <div className="max-w-64">
              <Status
                label="This is a longer status label that truncates cleanly in constrained layouts"
                variant="info"
              />
            </div>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Checkbox" description="Selection control with indeterminate state.">
        <CheckboxShowcase />
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Rich Text Editor"
        description="Lazy-loaded CodeMirror editor with JSON detection."
      >
        <RichTextEditorShowcase />
      </ShowcaseSection>

      <ShowcaseSection theme={theme} title="Copy Button" description="Clipboard copy with feedback.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-row items-center gap-2">
            <Text.Mono>Hello, world!</Text.Mono>
            <CopyButton value="Hello, world!" />
          </div>
          <div className="flex flex-row items-center gap-2">
            <Text.Mono>cuid_abc123def456</Text.Mono>
            <CopyButton value="cuid_abc123def456" />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Charts"
        description="ECharts bar chart with CSS-variable theming; skeleton for loading states."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">BarChart</Text.H6>
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
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">ChartSkeleton</Text.H6>
            <ChartSkeleton minHeight={160} />
          </div>
          <div className="flex flex-col gap-2">
            <Text.H6 weight="semibold">HistogramSkeleton</Text.H6>
            <HistogramSkeleton height={160} />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        theme={theme}
        title="Infinite Table"
        description="Virtualized list with sortable headers and an optional second row via renderSubheader."
      >
        <InfiniteTableSubheaderDemo />
      </ShowcaseSection>

      <Card className={`relative overflow-hidden border-border/70 shadow-xl ${surfaceClass}`}>
        <CardHeader className="relative">
          <CardTitle>
            <Text.H4 className="text-balance">Icons</Text.H4>
          </CardTitle>
          <CardDescription>
            <Text.H6 color="foregroundMuted">Lucide wrapper and brand icons.</Text.H6>
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Icon icon={Sparkles} size="sm" color="primary" />
              <Icon icon={Check} size="default" color="success" />
              <Icon icon={Palette} size="md" color="accentForeground" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <GoogleIcon className="h-5 w-5" />
              <GitHubIcon className="h-5 w-5" />
              <LatitudeLogo className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="relative">
          <Text.H6 color="foregroundMuted">
            `Select`, `Skeleton`, and `Tooltip` are exported in `@repo/ui` and are currently pending implementation.
          </Text.H6>
        </CardFooter>
      </Card>
    </div>
  )
}

type DemoRow = { id: string; name: string; amount: number }

const demoTableColumns: InfiniteTableColumn<DemoRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (r) => r.name,
    renderSubheader: () => (
      <Text.H6 color="foregroundMuted" className="truncate">
        —
      </Text.H6>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    align: "end",
    sortKey: "amount",
    render: (r) => r.amount,
    renderSubheader: () => (
      <Text.H6 color="foregroundMuted" className="truncate">
        subtotal
      </Text.H6>
    ),
  },
]

function InfiniteTableSubheaderDemo() {
  const data: DemoRow[] = [
    { id: "a", name: "Northwind", amount: 120 },
    { id: "b", name: "Contoso", amount: 84 },
    { id: "c", name: "Fabrikam", amount: 210 },
  ]

  return (
    <div className="h-[200px] min-h-0 flex flex-col rounded-lg border border-border/60">
      <InfiniteTable
        {...listingLayoutIntrinsicScroll.infiniteTable}
        data={data}
        columns={demoTableColumns}
        getRowKey={(r) => r.id}
        sorting={{ column: "amount", direction: "desc" }}
        defaultSorting={{ column: "amount", direction: "desc" }}
        onSortChange={() => {}}
      />
    </div>
  )
}

function CheckboxShowcase() {
  const [checked, setChecked] = useState<CheckedState>(false)
  const [showHitArea, setShowHitArea] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox checked={false} />
          <Text.H6>Unchecked</Text.H6>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked />
          <Text.H6>Checked</Text.H6>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked="indeterminate" />
          <Text.H6>Indeterminate</Text.H6>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox disabled />
          <Text.H6 color="foregroundMuted">Disabled</Text.H6>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={setChecked} className="hit-area-3" debugHitArea={showHitArea} />
        <Text.H6>Interactive (hit-area-3) — state: {String(checked)}</Text.H6>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={showHitArea} onCheckedChange={(v) => setShowHitArea(v === true)} />
        <Text.H6>Show hit area debug overlay</Text.H6>
      </div>
    </div>
  )
}

function RichTextEditorShowcase() {
  const [jsonValue, setJsonValue] = useState('{\n  "name": "Latitude",\n  "type": "platform"\n}')
  const [textValue, setTextValue] = useState("Hello, world!\nThis is plain text content.")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H6 weight="bold">JSON content (auto-detected)</Text.H6>
        <RichTextEditor value={jsonValue} onChange={setJsonValue} minHeight="100px" />
      </div>
      <div className="flex flex-col gap-1">
        <Text.H6 weight="bold">Plain text</Text.H6>
        <RichTextEditor value={textValue} onChange={setTextValue} minHeight="80px" />
      </div>
    </div>
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

  if (range?.from) {
    return `From ${range.from.toLocaleString()}`
  }

  if (range?.to) {
    return `Until ${range.to.toLocaleString()}`
  }

  return "No range selected"
}

function DateRangePickerShowcase() {
  const presets = [
    {
      id: "today",
      label: "Today",
      range: {
        from: startOfLocalDay(new Date()),
        to: endOfLocalDay(new Date()),
      },
    },
    {
      id: "last-7-days",
      label: "Last 7 days",
      range: {
        from: startOfLocalDay(subtractDays(7)),
        to: endOfLocalDay(new Date()),
      },
    },
    {
      id: "last-30-days",
      label: "Last 30 days",
      range: {
        from: startOfLocalDay(subtractDays(30)),
        to: endOfLocalDay(new Date()),
      },
    },
  ] as const
  const [range, setRange] = useState<DateRange | undefined>(presets[1].range)
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(presets[1].id)

  return (
    <div className="flex flex-col gap-3">
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
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <Text.H6 color="foregroundMuted">{formatRangePreview(range)}</Text.H6>
      </div>
    </div>
  )
}

function DesignSystemPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const pageSurfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  const applyTheme = (nextTheme: "light" | "dark") => {
    const root = document.documentElement
    root.classList.toggle("dark", nextTheme === "dark")
    root.style.colorScheme = nextTheme
  }

  const restoreHostTheme = () => {
    const root = document.documentElement
    const hostTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    root.classList.toggle("dark", hostTheme === "dark")
    root.style.colorScheme = hostTheme
  }

  useMountEffect(() => {
    applyTheme(theme)
    return () => {
      restoreHostTheme()
    }
  })

  return (
    <>
      <a
        href="#design-system-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>
      <main
        id="design-system-main"
        className={`flex min-h-screen flex-col gap-6 overflow-x-hidden p-4 text-foreground sm:p-6 lg:p-8 ${pageSurfaceClass}`}
      >
        <div className="flex w-full max-w-7xl self-center flex-col gap-6">
          <header
            className={`flex flex-col gap-4 rounded-2xl border border-border/70 p-5 shadow-xl sm:p-6 ${pageSurfaceClass}`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <span aria-hidden="true">←</span>
                Back to Home
              </Link>
              <Link
                to="/design-system/colors"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Colors
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <Text.H6 color="accentForeground" weight="semibold">
                UI Inventory
              </Text.H6>
              <Text.H2 className="text-balance">Design System</Text.H2>
            </div>

            <Text.H6 color="foregroundMuted">
              Review every implemented `@repo/ui` component in one place. Toggle theme to validate visual parity.
            </Text.H6>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTheme((currentTheme) => {
                      const nextTheme = currentTheme === "light" ? "dark" : "light"
                      applyTheme(nextTheme)
                      return nextTheme
                    })
                  }}
                >
                  <Icon icon={theme === "light" ? Moon : Sun} size="sm" />
                  {theme === "light" ? "Switch to Dark" : "Switch to Light"}
                </Button>
              </div>

              <div className={`flex items-center gap-2 rounded-lg border border-border/60 p-2 ${pageSurfaceClass}`}>
                <Text.H6 color="foregroundMuted">Theme</Text.H6>
                <Text.Mono>{theme}</Text.Mono>
              </div>
            </div>
          </header>

          <DesignSystemShowcase theme={theme} />
        </div>
      </main>
    </>
  )
}
