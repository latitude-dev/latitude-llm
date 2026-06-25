import { type FontSize, type FontWeight, font, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { TypeSample, TypographyRow, TypographySection, TypographyTable } from "./-components/typography-table.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/design-system/typography")({
  component: TypographyPage,
})

const HEADING_SCALE: {
  key: string
  example: ReactNode
  className: string
  usage: string
}[] = [
  {
    key: "h1",
    example: (
      <TypeSample size="h1" weight="semibold">
        Heading 1
      </TypeSample>
    ),
    className: "Text.H1",
    usage: "Page titles and hero headings.",
  },
  {
    key: "h2",
    example: (
      <TypeSample size="h2" weight="semibold">
        Heading 2
      </TypeSample>
    ),
    className: "Text.H2",
    usage: "Section titles.",
  },
  {
    key: "h3",
    example: (
      <TypeSample size="h3" weight="semibold">
        Heading 3
      </TypeSample>
    ),
    className: "Text.H3",
    usage: "Subsection headings.",
  },
  {
    key: "h4",
    example: (
      <TypeSample size="h4" weight="semibold">
        Heading 4
      </TypeSample>
    ),
    className: "Text.H4",
    usage: "Card titles and panel headers.",
  },
  {
    key: "h5",
    example: (
      <Text.H5 display="block" weight="medium">
        Heading 5 <Text.H5 color="foregroundMuted">with muted</Text.H5>
      </Text.H5>
    ),
    className: "Text.H5",
    usage: "Dense UI labels and list headings.",
  },
  {
    key: "h6",
    example: (
      <Text.H6 display="block" weight="medium">
        Heading 6 <Text.H6 color="foregroundMuted">with muted</Text.H6>
      </Text.H6>
    ),
    className: "Text.H6",
    usage: "Form labels, table headers, metadata.",
  },
  {
    key: "h7",
    example: (
      <TypeSample size="h7" weight="normal">
        Caption text for metadata and labels
      </TypeSample>
    ),
    className: "Text.H7",
    usage: "Timestamps, badges, and fine print.",
  },
  {
    key: "h8",
    example: (
      <TypeSample size="h8" weight="normal">
        Micro text
      </TypeSample>
    ),
    className: 'TextAtom size="h8"',
    usage: "Smallest readable UI text.",
  },
]

const WEIGHT_SCALE: { weight: FontWeight; usage: string }[] = [
  { weight: "light", usage: "Decorative emphasis only." },
  { weight: "normal", usage: "Body copy default." },
  { weight: "medium", usage: "Labels and secondary headings." },
  { weight: "semibold", usage: "Headings and strong labels." },
  { weight: "bold", usage: "High emphasis inline text." },
]

const FAMILY_SCALE = [
  {
    sample: <span className={`block ${font.family.sans} ${font.size.h4} font-medium`}>Sans — UI default</span>,
    className: "font.family.sans",
    usage: "Body text and UI labels (h5–h8).",
  },
  {
    sample: (
      <span className={`block ${font.family.display} ${font.size.h2} font-semibold`}>Display — marketing headings</span>
    ),
    className: "font.family.display",
    usage: "Display headings (h1–h4).",
  },
  {
    sample: <Text.Mono display="block">const traceId = &quot;abc123&quot;;</Text.Mono>,
    className: "font.family.mono",
    usage: "Code, IDs, and technical values.",
  },
] as const

function TypographyPage() {
  return (
    <DesignSystemPage
      eyebrow="Product"
      title="Typography"
      description="Type scale, weights, and families from @repo/ui. Use the Text component for all UI copy."
      wide
    >
      <UsageSection description="Typography styles are consumed through Text components from @repo/ui. Each export pre-sets size, weight, and family for its role.">
        <UsageCode
          lines={[
            'import { Text } from "@repo/ui"',
            "",
            '<Text.H3 weight="semibold">Section title</Text.H3>',
            '<Text.H5 color="foregroundMuted">Supporting copy</Text.H5>',
            '<Text.Mono size="h6">trace_abc123</Text.Mono>',
          ]}
        />
      </UsageSection>

      <TypographySection title="Headings" description="Used to introduce pages or sections.">
        <TypographyTable
          columns={[
            { label: "Example", kind: "demo" },
            { label: "Component", kind: "token" },
            { label: "Usage", kind: "meta" },
          ]}
        >
          {HEADING_SCALE.map(({ key, example, className, usage }) => (
            <TypographyRow key={key} example={example} token={className} meta={usage} />
          ))}
        </TypographyTable>
      </TypographySection>

      <TypographySection title="Body & mono" description="Paragraph-scale text and monospace primitives.">
        <TypographyTable
          columns={[
            { label: "Example", kind: "demo" },
            { label: "Component", kind: "token" },
            { label: "Usage", kind: "meta" },
          ]}
        >
          <TypographyRow
            example={<Text.H5 display="block">The quick brown fox jumps over the lazy dog.</Text.H5>}
            token="Text.H5"
            meta="Default body and description copy."
          />
          <TypographyRow
            example={
              <Text.Mono display="block" size="h5">
                npm install @latitude/sdk
              </Text.Mono>
            }
            token="Text.Mono"
            meta="Inline code snippets and terminal output."
          />
        </TypographyTable>
      </TypographySection>

      <TypographySection title="Weights" description="Font weight tokens applied via the weight prop.">
        <TypographyTable
          columns={[
            { label: "Example", kind: "demo" },
            { label: "Token", kind: "token" },
            { label: "Usage", kind: "meta" },
          ]}
        >
          {WEIGHT_SCALE.map(({ weight, usage }) => (
            <TypographyRow
              key={weight}
              example={
                <Text.H4 display="block" weight={weight}>
                  The quick brown fox
                </Text.H4>
              }
              token={`font.weight.${weight}`}
              meta={usage}
            />
          ))}
        </TypographyTable>
      </TypographySection>

      <TypographySection
        title="Families"
        description="Font stacks for sans, display, and mono."
        footnote="Display family applies automatically on Text.H1–H4; sans on H5–H8."
      >
        <TypographyTable
          columns={[
            { label: "Example", kind: "demo" },
            { label: "Token", kind: "token" },
            { label: "Usage", kind: "meta" },
          ]}
        >
          {FAMILY_SCALE.map(({ sample, className, usage }) => (
            <TypographyRow key={className} example={sample} token={className} meta={usage} />
          ))}
        </TypographyTable>
      </TypographySection>

      <TypographySection title="Raw size tokens" description="Tailwind classes from font.size.* when not using Text.">
        <TypographyTable
          columns={[
            { label: "Example", kind: "demo" },
            { label: "Token", kind: "token" },
            { label: "CSS class", kind: "token" },
          ]}
        >
          {(Object.keys(font.size) as FontSize[]).map((size) => (
            <TypographyRow
              key={size}
              example={
                <span className={`block font-sans font-semibold text-foreground ${font.size[size]}`}>
                  Heading {size}
                </span>
              }
              token={`font.size.${size}`}
              meta={font.size[size]}
              metaAsToken
            />
          ))}
        </TypographyTable>
      </TypographySection>
    </DesignSystemPage>
  )
}
