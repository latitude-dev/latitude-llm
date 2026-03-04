import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  GitHubIcon,
  GoogleIcon,
  Icon,
  Input,
  Label,
  LatitudeLogo,
  Text,
} from "@repo/ui"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Check, Moon, Palette, Sparkles, Sun } from "lucide-react"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/design-system")({
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

      <ShowcaseSection theme={theme} title="Buttons" description="Variants, states, and visual hierarchy.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline" flat>
            Outline Flat
          </Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button isLoading>Loading…</Button>
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
            `Checkbox`, `Select`, `Skeleton`, and `Tooltip` are exported in `@repo/ui` and are currently pending
            implementation.
          </Text.H6>
        </CardFooter>
      </Card>
    </div>
  )
}

function DesignSystemPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const pageSurfaceClass = theme === "dark" ? "bg-black" : "bg-white"

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.style.colorScheme = theme

    return () => {
      const hostTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      root.classList.toggle("dark", hostTheme === "dark")
      root.style.colorScheme = hostTheme
    }
  }, [theme])

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
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <span aria-hidden="true">←</span>
              Back to Home
            </Link>

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
                  flat
                  onClick={() => {
                    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"))
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
