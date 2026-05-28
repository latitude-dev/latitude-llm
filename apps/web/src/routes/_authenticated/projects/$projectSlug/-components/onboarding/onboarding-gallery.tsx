import { Button, Text } from "@repo/ui"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { OnboardingPreviewImage } from "./onboarding-preview-image.tsx"

const WAITING_GALLERY: ReadonlyArray<{ readonly title: string; readonly description: string; readonly image: string }> =
  [
    {
      title: "Live traces coming in",
      description: "As soon as we detect your first trace, you will start getting comprehensive insights",
      image: "/onboarding/traces.png",
    },
    {
      title: "Debug responses with context",
      description: "Inspect model calls, timing, costs and session metadata in one place",
      image: "/onboarding/home.png",
    },
    {
      title: "Detect issues automatically",
      description: "Once the telemetry is set up, Latitude will start monitoring your product for common issues",
      image: "/onboarding/issues.png",
    },
  ]

const ONBOARDING_IMAGE_DIMENSIONS: Record<
  string,
  {
    readonly width: number
    readonly height: number
  }
> = {
  "/onboarding/role-engineer.png": { width: 1024, height: 567 },
  "/onboarding/home.png": { width: 1024, height: 580 },
  "/onboarding/issues.png": { width: 1024, height: 579 },
  "/onboarding/traces.png": { width: 1024, height: 579 },
}

export function OnboardingGallery({
  galleryIndex,
  setGalleryIndex,
}: {
  readonly galleryIndex: number
  readonly setGalleryIndex: Dispatch<SetStateAction<number>>
}) {
  const galleryItemIndex = WAITING_GALLERY.length === 0 ? 0 : galleryIndex % WAITING_GALLERY.length
  const activeGalleryItem = WAITING_GALLERY[galleryItemIndex] ?? {
    title: "",
    description: "",
    image: "",
  }
  const galleryImageDimensions = ONBOARDING_IMAGE_DIMENSIONS[activeGalleryItem.image] ?? { width: 1024, height: 579 }

  return (
    <div className="flex h-fit w-full flex-col items-start">
      <div className="flex w-full max-w-[591px] flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Text.H5M>{activeGalleryItem.title}</Text.H5M>
          <Text.H6 color="foregroundMuted">{activeGalleryItem.description}</Text.H6>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setGalleryIndex((c) => (c === 0 ? WAITING_GALLERY.length - 1 : c - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setGalleryIndex((c) => (c + 1) % WAITING_GALLERY.length)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-10 w-full">
        <OnboardingPreviewImage
          src={activeGalleryItem.image}
          alt={activeGalleryItem.title}
          width={galleryImageDimensions.width}
          height={galleryImageDimensions.height}
        />
      </div>
    </div>
  )
}
