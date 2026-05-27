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

/** Picks a type-aware (monochrome) lucide icon from the mime type, falling back to modality then generic. */
function fileIconForMime(mimeType?: string | null, modality?: string): LucideIcon {
  const mime = (mimeType ?? "").toLowerCase().split(";")[0] ?? ""
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

/** Human-readable type label, e.g. "PDF document"; derives from the mime subtype, then modality. */
function fileTypeLabel(mimeType?: string | null, modality?: string): string {
  const mime = (mimeType ?? "").toLowerCase().split(";")[0] ?? ""
  if (MIME_LABELS[mime]) return MIME_LABELS[mime]
  const subtype = mime.includes("/") ? mime.split("/")[1] : undefined
  if (subtype) return subtype.replace(/^x-/, "").replace(/[-.]/g, " ").toUpperCase()
  if (modality) return modality.charAt(0).toUpperCase() + modality.slice(1)
  return "File"
}

/** File extension for the download filename, e.g. "application/pdf" -> "pdf". */
function fileExtensionForMime(mimeType?: string | null): string | undefined {
  const mime = (mimeType ?? "").toLowerCase().split(";")[0] ?? ""
  if (MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime]
  const subtype = mime.includes("/") ? mime.split("/")[1] : undefined
  return subtype && /^[a-z0-9]+$/.test(subtype) ? subtype : undefined
}

/**
 * Renders a non-previewable attachment (document/file) as a card: type-aware icon + label + optional size.
 * The action depends on the source — `href` (uri) opens in a new tab, `downloadDataUri` (blob) downloads,
 * and a bare `fileId` (no resolvable source) renders a disabled action with an explanatory tooltip while
 * surfacing the id as the secondary line.
 */
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

  const secondaryBits: string[] = []
  if (fileName) secondaryBits.push(typeLabel)
  if (sizeBytes != null) secondaryBits.push(formatBytes(sizeBytes))
  const secondary = secondaryBits.join(" · ")

  const extension = fileExtensionForMime(mimeType)
  const downloadName = fileName ?? `attachment${extension ? `.${extension}` : ""}`

  const action = href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Open file in new tab" className={ACTION_CLASS}>
      <Icon icon={ExternalLinkIcon} size="sm" />
    </a>
  ) : downloadDataUri ? (
    <a href={downloadDataUri} download={downloadName} aria-label="Download file" className={ACTION_CLASS}>
      <Icon icon={DownloadIcon} size="sm" />
    </a>
  ) : (
    // No resolvable source — keep the affordance but disable it and explain why on hover.
    // `aria-disabled` (not the native `disabled` attr) so the tooltip still fires.
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
      {action}
    </div>
  )
}
