import * as SliderPrimitive from "@radix-ui/react-slider"
import type { ComponentPropsWithoutRef, ComponentRef, Ref } from "react"
import { cn } from "../../utils/cn.ts"

export type SliderProps = ComponentPropsWithoutRef<typeof SliderPrimitive.Root>

/** A vertical slider fills its container's height; with no height set it collapses to nothing. */
export function Slider({
  className = "",
  ref,
  ...props
}: SliderProps & { ref?: Ref<ComponentRef<typeof SliderPrimitive.Root>> }) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex touch-none select-none items-center",
        "data-[orientation=horizontal]:w-full",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:flex-col data-[orientation=vertical]:justify-center",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative grow overflow-hidden rounded-full bg-muted",
          "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            "absolute bg-primary data-[disabled]:bg-muted-foreground",
            "data-[orientation=horizontal]:h-full",
            "data-[orientation=vertical]:w-full",
          )}
        />
      </SliderPrimitive.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            "block h-4 w-4 cursor-pointer rounded-full border border-primary/50 bg-background shadow transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "data-[disabled]:cursor-not-allowed",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}
