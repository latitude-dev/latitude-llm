import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">Latitude Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your Latitude dashboard</p>
      </div>
    </div>
  )
}
