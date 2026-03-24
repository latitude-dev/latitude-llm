import * as SliderPrimitive from "@radix-ui/react-slider"
import type { ComponentPropsWithoutRef, ComponentRef, Ref } from "react"

export type SliderProps = ComponentPropsWithoutRef<typeof SliderPrimitive.Root>

export function Slider({
  className = "",
  ref,
  ...props
}: SliderProps & { ref?: Ref<ComponentRef<typeof SliderPrimitive.Root>> }) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={`relative flex w-full touch-none select-none items-center ${className}`}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
        />
      ))}
    </SliderPrimitive.Root>
  )
}
