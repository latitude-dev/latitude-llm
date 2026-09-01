import type { TaxonomyClusterTrendStatus } from "@domain/taxonomy"
import type { BadgeProps } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, FlameIcon, MinusIcon, SparklesIcon } from "lucide-react"

export const trendLabel = (status: TaxonomyClusterTrendStatus): string => {
  switch (status) {
    case "new":
      return "new"
    case "spike":
      return "spiking"
    case "rising":
      return "rising"
    case "steady":
      return "steady"
    case "cooling":
      return "cooling"
    case "fading":
      return "fading"
  }
}

export const trendIcon = (status: TaxonomyClusterTrendStatus) => {
  switch (status) {
    case "new":
      return SparklesIcon
    case "spike":
      return FlameIcon
    case "rising":
      return ArrowUpIcon
    case "cooling":
    case "fading":
      return ArrowDownIcon
    case "steady":
      return MinusIcon
  }
}

export const trendBadgeVariant = (status: TaxonomyClusterTrendStatus): NonNullable<BadgeProps["variant"]> => {
  switch (status) {
    case "new":
      return "accent"
    case "spike":
      return "yellow"
    case "rising":
      return "successMuted"
    case "steady":
      return "muted"
    case "cooling":
      return "purple"
    case "fading":
      return "destructiveMuted"
  }
}
