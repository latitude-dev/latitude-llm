import { Slot } from "@radix-ui/react-slot";
import { type ReactNode, forwardRef, memo } from "react";

import {
  type FontSize,
  type FontSpacing,
  type FontWeight,
  type Overflow,
  type TextColor,
  type TextOpacity,
  type WhiteSpace,
  type WordBreak,
  colors,
  font,
  opacity,
  overflow as overflowOptions,
  whiteSpace as whiteSpaceOptions,
  wordBreak as wordBreakOptions,
} from "../../tokens/index.js";
import { cn } from "../../utils/cn.js";

// Define display sizes as const outside component for better performance
const DISPLAY_SIZES = new Set<FontSize>(["h1", "h2", "h3", "h4"]);

type Display = "inline" | "inline-block" | "block";
export type Common = {
  id?: string;
  children: ReactNode;
  className?: string;
  color?: TextColor;
  textOpacity?: TextOpacity;
  align?: "left" | "center" | "right";
  capitalize?: boolean;
  uppercase?: boolean;
  wordBreak?: WordBreak;
  whiteSpace?: WhiteSpace;
  ellipsis?: boolean;
  display?: Display;
  userSelect?: boolean;
  noWrap?: boolean;
  underline?: boolean;
  lineThrough?: boolean;
  weight?: FontWeight;
  asChild?: boolean;
};

export type TextProps = {
  size?: FontSize;
  weight?: FontWeight;
  spacing?: FontSpacing;
  capitalize?: boolean;
  wordBreak?: WordBreak;
  uppercase?: boolean;
  userSelect?: boolean;
};

type AllTextProps = TextProps & Common;

const TextAtom = memo(
  forwardRef<HTMLElement, AllTextProps>(function Text(
    {
      id,
      children,
      className,
      size = "h4",
      color = "foreground",
      textOpacity = 100,
      spacing = "normal",
      weight = "normal",
      display = "inline",
      uppercase = false,
      align = "left",
      capitalize = false,
      whiteSpace = "normal",
      wordBreak = "normal",
      ellipsis = false,
      userSelect = true,
      noWrap = false,
      underline = false,
      lineThrough = false,
      asChild = false,
    },
    ref,
  ) {
    const colorClass = colors.textColors[color];
    const sizeClass = font.size[size];
    const weightClass = font.weight[weight];
    const spacingClass = font.spacing[spacing];
    const alignClass = font.align[align];
    const wordBreakClass = wordBreakOptions[wordBreak];
    const whiteSpaceClass = whiteSpaceOptions[whiteSpace];
    const Comp = asChild ? Slot : "span";
    const isDisplay = DISPLAY_SIZES.has(size);
    return (
      <Comp
        id={id}
        ref={ref}
        className={cn(
          sizeClass,
          weightClass,
          spacingClass,
          colorClass,
          opacity.text[textOpacity],
          wordBreakClass,
          whiteSpaceClass,
          alignClass,
          display,
          className,
          {
            capitalize: capitalize,
            uppercase: uppercase,
            truncate: ellipsis,
            "select-none": !userSelect,
            "whitespace-nowrap": noWrap,
            underline: underline,
            "line-through": lineThrough,
            [font.family.mono]: false,
            [font.family.sans]: !isDisplay,
            [font.family.display]: isDisplay,
          },
        )}
      >
        {children}
      </Comp>
    );
  }),
);

namespace Text {
  export const H1 = forwardRef<HTMLHeadingElement, Common>(function H1(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h1" {...props} />;
  });
  H1.displayName = "Text.H1";

  export const H2 = forwardRef<HTMLHeadingElement, Common>(function H2(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h2" {...props} />;
  });
  H2.displayName = "Text.H2";

  export const H3 = forwardRef<HTMLHeadingElement, Common>(function H3(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h3" {...props} />;
  });
  H3.displayName = "Text.H3";

  export const H4 = forwardRef<HTMLHeadingElement, Common>(function H4(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h4" {...props} />;
  });
  H4.displayName = "Text.H4";

  export const H5 = forwardRef<HTMLHeadingElement, Common>(function H5(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h5" {...props} />;
  });
  H5.displayName = "Text.H5";

  export const H6 = forwardRef<HTMLHeadingElement, Common>(function H6(props, ref) {
    return <TextAtom ref={ref as React.Ref<HTMLElement>} size="h6" {...props} />;
  });
  H6.displayName = "Text.H6";

  export type MonoProps = {
    children: ReactNode;
    color?: TextColor;
    weight?: Extract<FontWeight, "normal" | "semibold" | "bold">;
    userSelect?: boolean;
    overflow?: Overflow;
    ellipsis?: boolean;
    display?: Display;
    underline?: boolean;
    lineThrough?: boolean;
    size?: FontSize;
    textTransform?: "none" | "uppercase" | "lowercase";
    whiteSpace?: WhiteSpace;
    wordBreak?: WordBreak;
  };

  export const Mono = forwardRef<HTMLSpanElement, MonoProps>(function MonoFont(
    {
      children,
      color = "foreground",
      overflow = "auto",
      whiteSpace = "pre",
      wordBreak = "normal",
      underline = false,
      lineThrough = false,
      size = "h6",
      textTransform = "none",
      userSelect = true,
      weight = "normal",
      ellipsis = false,
      display = "inline",
    },
    ref,
  ) {
    const sizeClass = font.size[size];

    return (
      <span
        ref={ref}
        className={cn(
          sizeClass,
          font.family.mono,
          font.weight[weight],
          colors.textColors[color],
          overflowOptions[overflow],
          wordBreakOptions[wordBreak],
          {
            [display]: !ellipsis,
            [whiteSpaceOptions[whiteSpace]]: !!whiteSpace,
            "block truncate": ellipsis,
            "select-none": !userSelect,
            "line-through": lineThrough,
            underline: underline,
            [textTransform]: textTransform !== "none",
          },
        )}
      >
        {children}
      </span>
    );
  });
  Mono.displayName = "Text.Mono";
}

export { Text };
