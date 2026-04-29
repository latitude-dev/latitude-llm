import { isJsonBlock, prettifyCompactJson } from "@repo/utils"
import { Maximize2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "../button/button.tsx"
import { CopyButton } from "../copy-button/index.tsx"
import { flattenHighlightedTokens, lowlight } from "../genai-conversation/parts/syntax-highlight.ts"
import { Icon } from "../icons/icons.tsx"
import { Modal } from "../modal/modal.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"

export type CodeBlockControlsProps = {
  readonly content: string
  readonly language?: string | undefined
  readonly copyable?: boolean
  readonly expandable?: boolean
}

function titleFor(language: string | undefined, isJson: boolean): string {
  if (isJson) return "JSON"
  if (!language) return "Code"
  return language.charAt(0).toUpperCase() + language.slice(1)
}

function HighlightedTokens({ content, language }: { readonly content: string; readonly language: string | undefined }) {
  const detected = useMemo(() => {
    if (language && lowlight.registered(language)) return language
    if (isJsonBlock(content)) return "json"
    return null
  }, [content, language])

  const tokens = useMemo(() => {
    if (!detected) return null
    return flattenHighlightedTokens(lowlight.highlight(detected, content), 0)
  }, [content, detected])

  if (!tokens) return <>{content}</>

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} {...(token.hljsClass ? { className: token.hljsClass } : {})}>
          {token.text}
        </span>
      ))}
    </>
  )
}

export function CodeBlockControls({
  content,
  language,
  copyable = true,
  expandable = true,
}: CodeBlockControlsProps) {
  const [open, setOpen] = useState(false)

  const isJson = useMemo(() => language === "json" || isJsonBlock(content), [content, language])
  const prettified = useMemo(() => (isJson ? prettifyCompactJson(content) : content), [content, isJson])

  if (!copyable && !expandable) return null

  return (
    <>
      <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5">
        {copyable ? <CopyButton value={content} tooltip="Copy" /> : null}
        {expandable ? (
          <Tooltip
            asChild
            trigger={
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Expand">
                <Icon icon={Maximize2} size="sm" color="foregroundMuted" />
              </Button>
            }
          >
            <Text.Mono size="h6">Expand</Text.Mono>
          </Tooltip>
        ) : null}
      </div>
      {expandable ? (
        <Modal
          open={open}
          onOpenChange={setOpen}
          dismissible
          size="full"
          height="screen"
          scrollable={false}
          title={titleFor(language, isJson)}
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-muted">
            <div className="absolute top-1 right-1 z-10">
              <CopyButton value={prettified} tooltip="Copy" />
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 pr-12 text-xs">
              <code>
                <HighlightedTokens content={prettified} language={language} />
              </code>
            </pre>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
