/** Full-width preview: fills the right pane width with natural image height. */
export function OnboardingPreviewImage({
  src,
  alt,
  width,
  height,
}: {
  readonly src: string
  readonly alt: string
  readonly width: number
  readonly height: number
}) {
  return (
    <div className="w-full overflow-hidden rounded-xl border-4 border-border bg-card shadow-xl">
      <img src={src} alt={alt} width={width} height={height} className="block h-auto w-full max-w-full" />
    </div>
  )
}
