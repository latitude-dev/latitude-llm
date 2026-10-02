import { Button, CodeBlock, CopyButton, Icon, Modal, Text } from "@repo/ui"
import { Maximize2 } from "lucide-react"
import { Fragment, useState } from "react"

export function MetadataJson({ value }: { readonly value: unknown }) {
  const formatted = JSON.stringify(value, null, 2) ?? "null"
  const [expanded, setExpanded] = useState(false)
  const tokens = formatted.split(/("(?:[^"\\]|\\.)*")/g)

  const content = (
    <Text.Mono size="h6" asChild>
      <pre className="whitespace-pre-wrap break-all">
        {tokens.map((token, index) => {
          const isValue = token.startsWith('"') && !tokens[index + 1]?.trimStart().startsWith(":")
          const href = isValue ? metadataUrl(JSON.parse(token)) : undefined
          return href ? (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {token}
            </a>
          ) : (
            <Fragment key={index}>{token}</Fragment>
          )
        })}
      </pre>
    </Text.Mono>
  )

  const hasLinks = tokens.some(
    (token, index) =>
      token.startsWith('"') && !tokens[index + 1]?.trimStart().startsWith(":") && metadataUrl(JSON.parse(token)),
  )
  if (!hasLinks) return <CodeBlock value={formatted} className="bg-secondary" />

  return (
    <div className="flex flex-col gap-1 rounded-md bg-secondary p-3">
      <div className="flex justify-end gap-1">
        <CopyButton value={formatted} tooltip="Copy metadata" />
        <Button variant="ghost" size="icon" aria-label="Expand metadata" onClick={() => setExpanded(true)}>
          <Icon icon={Maximize2} size="sm" />
        </Button>
      </div>
      {content}
      <Modal open={expanded} onOpenChange={setExpanded} dismissible size="full" height="screen" title="Metadata">
        <div className="flex flex-col gap-2 rounded-md bg-secondary p-3">
          <div className="flex justify-end">
            <CopyButton value={formatted} tooltip="Copy metadata" />
          </div>
          {content}
        </div>
      </Modal>
    </div>
  )
}

function metadataUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? value : undefined
  } catch {
    return undefined
  }
}
