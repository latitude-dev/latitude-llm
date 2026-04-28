import { Input } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { SearchIcon } from "lucide-react"
import { useState } from "react"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/search/")({
  component: SearchPage,
})

function SearchPage() {
  const [query, setQuery] = useState("")

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow className="justify-stretch">
            <div className="relative w-full">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                size="lg"
                className="w-full pl-9"
              />
            </div>
          </Layout.ActionsRow>
        </Layout.Actions>
      </Layout.Content>
    </Layout>
  )
}
