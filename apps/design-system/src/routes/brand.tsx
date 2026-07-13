import { Button, Icon, LatitudeLogo } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { Download } from "lucide-react"
import type { ReactNode } from "react"
import { DemoFrame } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { useDesignSystemTheme } from "./-components/design-system-theme.tsx"
import { TypographySection } from "./-components/typography-table.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/brand")({
  component: BrandPage,
})

function LogoDownloadButton({ href, filename, label }: { href: string; filename: string; label: string }) {
  return (
    <Button variant="outline" size="sm" className="h-6 w-auto shrink-0 gap-1 px-2 text-[11px]" asChild>
      <a href={href} download={filename}>
        <Icon icon={Download} size="xs" />
        {label}
      </a>
    </Button>
  )
}

function BrandLogoFrame({ children, downloads }: { children: ReactNode; downloads: ReactNode }) {
  return (
    <DemoFrame className="relative flex min-h-52 items-center justify-center sm:min-h-60">
      {children}
      <div className="absolute right-3 bottom-3 flex flex-row items-center justify-end gap-1.5">{downloads}</div>
    </DemoFrame>
  )
}

function BrandPage() {
  const { theme } = useDesignSystemTheme()
  const isDark = theme === "dark"
  const fullLogoBase = isDark ? "/latitude-logo-dark" : "/latitude-logo"
  const markLogoBase = isDark ? "/latitude-logo-mark-dark" : "/latitude-logo-mark"

  return (
    <DesignSystemPage
      eyebrow="General"
      title="Brand"
      description="Latitude logo assets for product UI, marketing, and partner materials."
    >
      <UsageSection description="Import the logo mark from @repo/ui. Use the PNG or SVG lockup from /public when the wordmark is required.">
        <UsageCode
          lines={[
            'import { LatitudeLogo } from "@repo/ui"',
            "",
            '<LatitudeLogo className="h-5 w-5" />',
            '<img src="/latitude-logo.png" alt="Latitude" className="h-8 w-auto" />',
          ]}
        />
      </UsageSection>

      <TypographySection
        title="Logo mark"
        description="The standalone icon from LatitudeLogo in @repo/ui. Use for compact surfaces such as nav bars, favicons, and avatars. The LatitudeLogo component itself is not theme-aware, so dark surfaces should use the dark SVG asset instead."
      >
        <BrandLogoFrame
          downloads={
            <LogoDownloadButton href={`${markLogoBase}.svg`} filename={`${markLogoBase.slice(1)}.svg`} label="SVG" />
          }
        >
          {isDark ? (
            <img src={`${markLogoBase}.svg`} alt="Latitude" className="h-28 w-28 sm:h-32 sm:w-32" />
          ) : (
            <LatitudeLogo className="h-28 w-28 sm:h-32 sm:w-32" />
          )}
        </BrandLogoFrame>
      </TypographySection>

      <TypographySection
        title="Full logo"
        description="The mark paired with the Latitude wordmark. Use when there is room for the full lockup, such as auth screens and email headers. A dark-theme variant with a light wordmark is available for dark surfaces."
      >
        <BrandLogoFrame
          downloads={
            <>
              <LogoDownloadButton href={`${fullLogoBase}.png`} filename={`${fullLogoBase.slice(1)}.png`} label="PNG" />
              <LogoDownloadButton href={`${fullLogoBase}.svg`} filename={`${fullLogoBase.slice(1)}.svg`} label="SVG" />
            </>
          }
        >
          <img src={`${fullLogoBase}.png`} alt="Latitude" className="h-14 w-auto sm:h-16" />
        </BrandLogoFrame>
      </TypographySection>
    </DesignSystemPage>
  )
}
