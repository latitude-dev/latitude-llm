import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "@repo/ui/styles/globals.css";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Text,
} from "@repo/ui";

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [inputValue, setInputValue] = useState("");

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-background p-8 transition-colors">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Text.H1>Latitude Design System</Text.H1>
            <Button variant="outline" onClick={() => setDarkMode(!darkMode)}>
              <Icon name={darkMode ? "Sun" : "Moon"} size="sm" className="mr-2" />
              {darkMode ? "Light Mode" : "Dark Mode"}
            </Button>
          </div>

          <Text.H4 color="foregroundMuted">
            A comprehensive React component library built with Tailwind CSS and Radix UI.
          </Text.H4>

          {/* Typography Section */}
          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <CardDescription>Text components with consistent styling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Text.H1>Heading 1</Text.H1>
              <Text.H2>Heading 2</Text.H2>
              <Text.H3>Heading 3</Text.H3>
              <Text.H4>Heading 4</Text.H4>
              <Text.H5>Heading 5</Text.H5>
              <Text.H6>Heading 6</Text.H6>
              <Text.Mono>Monospace text for code</Text.Mono>
            </CardContent>
          </Card>

          {/* Buttons Section */}
          <Card>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
              <CardDescription>Various button styles and states</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Button>Default</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-4">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-4">
                <Button isLoading>Loading</Button>
                <Button disabled>Disabled</Button>
              </div>
            </CardContent>
          </Card>

          {/* Icons Section */}
          <Card>
            <CardHeader>
              <CardTitle>Icons</CardTitle>
              <CardDescription>Lucide icons with size variants</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Icon name="Check" size="xs" />
                <Icon name="Check" size="sm" />
                <Icon name="Check" size="default" />
                <Icon name="Check" size="md" />
                <Icon name="Check" size="lg" />
                <Icon name="Check" size="xl" />
                <Icon name="Check" size="2xl" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Icon name="Home" />
                <Icon name="Settings" />
                <Icon name="User" />
                <Icon name="Search" />
                <Icon name="Mail" />
                <Icon name="Bell" />
                <Icon name="Menu" />
                <Icon name="X" />
              </div>
            </CardContent>
          </Card>

          {/* Form Section */}
          <Card>
            <CardHeader>
              <CardTitle>Form Components</CardTitle>
              <CardDescription>Input fields with labels and validation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Email Address"
                description="We'll never share your email with anyone else."
                type="email"
                placeholder="Enter your email"
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
              />
              <Input label="Username" info="Required" placeholder="Enter username" />
              <Input
                label="Password"
                type="password"
                placeholder="Enter password"
                errors={["Password must be at least 8 characters"]}
              />
            </CardContent>
          </Card>

          {/* Colors Section */}
          <Card>
            <CardHeader>
              <CardTitle>Theme Colors</CardTitle>
              <CardDescription>CSS variables for theming</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-background border" />
                  <Text.H6>Background</Text.H6>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-primary" />
                  <Text.H6>Primary</Text.H6>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-secondary" />
                  <Text.H6>Secondary</Text.H6>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-accent" />
                  <Text.H6>Accent</Text.H6>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-destructive" />
                  <Text.H6>Destructive</Text.H6>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-muted" />
                  <Text.H6>Muted</Text.H6>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-card border" />
                  <Text.H6>Card</Text.H6>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-popover border" />
                  <Text.H6>Popover</Text.H6>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
