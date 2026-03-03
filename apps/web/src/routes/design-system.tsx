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

function DesignSystemShowcase({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-4 text-foreground">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary p-3">
        <div className="flex items-center gap-2">
          <Icon icon={Palette} color="accentForeground" />
          <Text.H5 weight="semibold">{theme === "light" ? "Light Mode" : "Dark Mode"}</Text.H5>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-card p-2">
          <LatitudeLogo className="h-5 w-5" />
          <Text.H6 color="foregroundMuted">@repo/ui</Text.H6>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Text.H4>Typography</Text.H4>
          </CardTitle>
          <CardDescription>
            <Text.H6 color="foregroundMuted">Text scales and mono primitives</Text.H6>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Text.H1>Heading 1</Text.H1>
            <Text.H2>Heading 2</Text.H2>
            <Text.H3>Heading 3</Text.H3>
            <Text.H4>Heading 4</Text.H4>
            <Text.H5>Heading 5</Text.H5>
            <Text.H6>Heading 6</Text.H6>
            <Text.Mono>const status = "ready";</Text.Mono>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Text.H4>Buttons</Text.H4>
          </CardTitle>
          <CardDescription>
            <Text.H6 color="foregroundMuted">Variants, states and icons</Text.H6>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline" flat>
              Outline Flat
            </Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button isLoading>Loading</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Text.H4>Forms</Text.H4>
          </CardTitle>
          <CardDescription>
            <Text.H6 color="foregroundMuted">Input, label and form field composition</Text.H6>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Input label={<Text.H6>Email</Text.H6>} placeholder="hello@latitude.so" />
            <FormField
              label={<Text.H6>Workspace Name</Text.H6>}
              description={<Text.H6 color="foregroundMuted">Used across your tenant settings</Text.H6>}
              errors={["Must include at least 3 characters"]}
            >
              <Input placeholder="Acme Inc." aria-invalid="true" />
            </FormField>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`manual-input-${theme}`}>
                <Text.H6>Manual Label + Input</Text.H6>
              </Label>
              <Input id={`manual-input-${theme}`} placeholder="Custom field" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Text.H4>Icons</Text.H4>
          </CardTitle>
          <CardDescription>
            <Text.H6 color="foregroundMuted">Lucide wrapper and brand icons</Text.H6>
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        <CardFooter>
          <Text.H6 color="foregroundMuted">
            `Checkbox`, `Select`, `Skeleton`, and `Tooltip` are declared in `@repo/ui` and currently pending
            implementation.
          </Text.H6>
        </CardFooter>
      </Card>
    </div>
  )
}

function DesignSystemPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const root = document.documentElement
    const hadDarkBeforeMount = root.classList.contains("dark")

    root.classList.toggle("dark", theme === "dark")

    return () => {
      root.classList.toggle("dark", hadDarkBeforeMount)
    }
  }, [theme])

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6 lg:p-8">
      <div className="flex w-full max-w-7xl self-center flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text.H2>Design System</Text.H2>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                flat
                onClick={() => {
                  setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"))
                }}
              >
                <Icon icon={theme === "light" ? Moon : Sun} size="sm" />
                {theme === "light" ? "Switch to dark" : "Switch to light"}
              </Button>
              <Button asChild variant="outline" flat>
                <Link to="/">Back to home</Link>
              </Button>
            </div>
          </div>
          <Text.H6 color="foregroundMuted">
            Interactive preview of the current `@repo/ui` component set. Toggle to validate both light and dark themes.
          </Text.H6>
        </div>

        <div className="flex flex-col gap-6">
          <DesignSystemShowcase theme={theme} />
        </div>
      </div>
    </main>
  )
}
