import { formatBytes } from "@repo/utils"
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../../../utils/cn.ts"
import { Icon } from "../../icons/icons.tsx"
import { Text } from "../../text/text.tsx"
import { Tooltip } from "../../tooltip/tooltip.tsx"

const ACTION_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF document",
  "application/json": "JSON",
  "text/csv": "CSV",
  "text/plain": "Text",
  "text/html": "HTML",
  "text/markdown": "Markdown",
  "application/zip": "Archive",
  "application/msword": "Word document",
  "application/vnd.ms-excel": "Excel spreadsheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel spreadsheet",
}

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/json": "json",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/html": "html",
  "text/markdown": "md",
  "application/zip": "zip",
}

function normalizeMime(mimeType?: string | null): string {
  return (mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
}

function fileIconForMime(mimeType?: string | null, modality?: string): LucideIcon {
  const mime = normalizeMime(mimeType)
  if (mime === "application/pdf") return FileTextIcon
  if (mime === "application/json") return FileJsonIcon
  if (mime.includes("csv") || mime.includes("spreadsheet") || mime.includes("excel")) return FileSpreadsheetIcon
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gzip") || mime.includes("compressed")) {
    return FileArchiveIcon
  }
  if (mime.includes("xml") || mime.includes("javascript") || mime.includes("html") || mime.startsWith("text/x-")) {
    return FileCodeIcon
  }
  if (mime.startsWith("image/") || modality === "image") return FileImageIcon
  if (mime.startsWith("audio/") || modality === "audio") return FileAudioIcon
  if (mime.startsWith("video/") || modality === "video") return FileVideoIcon
  if (mime.startsWith("text/")) return FileTextIcon
  return FileIcon
}

function fileTypeLabel(mimeType?: string | null, modality?: string): string {
  const mime = normalizeMime(mimeType)
  if (MIME_LABELS[mime]) return MIME_LABELS[mime]
  const subtype = mime.includes("/") ? mime.split("/")[1] : undefined
  if (subtype) return subtype.replace(/^x-/, "").replace(/[-.]/g, " ").toUpperCase()
  if (modality) return modality.charAt(0).toUpperCase() + modality.slice(1)
  return "File"
}

function fileExtensionForMime(mimeType?: string | null): string | undefined {
  const mime = normalizeMime(mimeType)
  if (MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime]
  const subtype = mime.includes("/") ? mime.split("/")[1] : undefined
  return subtype && /^[a-z0-9]+$/.test(subtype) ? subtype : undefined
}

function ActionLink({
  href,
  label,
  download,
  icon: ActionIcon,
}: {
  readonly href: string
  readonly label: string
  readonly download?: string | undefined
  readonly icon: LucideIcon
}) {
  return (
    <a
      href={href}
      {...(download ? { download } : { target: "_blank" as const, rel: "noopener noreferrer" })}
      aria-label={label}
      className={ACTION_CLASS}
    >
      <Icon icon={ActionIcon} size="sm" />
    </a>
  )
}

export function FileCard({
  fileName,
  mimeType,
  modality,
  fileId,
  sizeBytes,
  href,
  downloadDataUri,
}: {
  readonly fileName?: string | undefined
  readonly mimeType?: string | null | undefined
  readonly modality?: string | undefined
  readonly fileId?: string | undefined
  readonly sizeBytes?: number | undefined
  readonly href?: string | undefined
  readonly downloadDataUri?: string | undefined
}) {
  const FileTypeIcon = fileIconForMime(mimeType, modality)
  const typeLabel = fileTypeLabel(mimeType, modality)
  const primary = fileName ?? typeLabel
  const isPdf = normalizeMime(mimeType) === "application/pdf"

  const secondaryBits: string[] = []
  if (fileName) secondaryBits.push(typeLabel)
  if (sizeBytes != null) secondaryBits.push(formatBytes(sizeBytes))
  const secondary = secondaryBits.join(" · ")

  const extension = fileExtensionForMime(mimeType)
  const downloadName = fileName ?? `attachment${extension ? `.${extension}` : ""}`

  let actions: ReactNode
  // Top-level data: navigation is blocked; Preview only when we have an http(s)/blob href.
  // Download is only offered for same-origin data URIs (cross-origin `download` is ignored).
  if (isPdf && href && downloadDataUri) {
    actions = (
      <div className="flex shrink-0 items-center gap-1.5">
        <ActionLink href={href} label="Preview PDF" icon={ExternalLinkIcon} />
        <ActionLink href={downloadDataUri} label="Download PDF" download={downloadName} icon={DownloadIcon} />
      </div>
    )
  } else if (isPdf && href) {
    actions = <ActionLink href={href} label="Preview PDF" icon={ExternalLinkIcon} />
  } else if (isPdf && downloadDataUri) {
    actions = (
      <ActionLink href={downloadDataUri} label="Download PDF" download={downloadName} icon={DownloadIcon} />
    )
  } else if (href) {
    actions = <ActionLink href={href} label="Open file in new tab" icon={ExternalLinkIcon} />
  } else if (downloadDataUri) {
    actions = <ActionLink href={downloadDataUri} label="Download file" download={downloadName} icon={DownloadIcon} />
  } else {
    // aria-disabled (not disabled) so the tooltip still fires.
    actions = (
      <Tooltip
        asChild
        trigger={
          <button
            type="button"
            aria-disabled="true"
            aria-label="No downloadable source"
            className={cn(ACTION_CLASS, "cursor-not-allowed opacity-50")}
          >
            <Icon icon={DownloadIcon} size="sm" />
          </button>
        }
      >
        This attachment has no downloadable source.
      </Tooltip>
    )
  }

  return (
    <div className="flex max-w-md items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon icon={FileTypeIcon} size="default" color="foregroundMuted" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Text.H6 ellipsis>{primary}</Text.H6>
        {secondary ? (
          <Text.H6 color="foregroundMuted" ellipsis>
            {secondary}
          </Text.H6>
        ) : null}
        {fileId ? (
          <Text.Mono size="h6" color="foregroundMuted" ellipsis>
            {fileId}
          </Text.Mono>
        ) : null}
      </div>
      {actions}
    </div>
  )
}
