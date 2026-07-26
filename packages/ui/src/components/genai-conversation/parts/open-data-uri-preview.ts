export function openDataUriPreview(dataUri: string) {
  try {
    const comma = dataUri.indexOf(",")
    const meta = dataUri.slice(5, comma)
    if (!dataUri.startsWith("data:") || comma < 0 || !meta.includes(";base64")) return
    const mime = meta.split(";")[0] || "application/octet-stream"
    const bytes = Uint8Array.from(atob(dataUri.slice(comma + 1)), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    // ignore malformed data URIs
  }
}
