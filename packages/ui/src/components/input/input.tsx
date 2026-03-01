import { type VariantProps, cva } from "class-variance-authority";
import { type InputHTMLAttributes, forwardRef } from "react";

import { font } from "../../tokens/index.js";
import { cn } from "../../utils/cn.js";
import { FormField } from "../form-field/form-field.js";

const inputVariants = cva(
  cn(
    "flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    font.size.h5,
  ),
  {
    variants: {
      size: {
        default: "h-9",
        sm: "h-8 px-2",
        lg: "h-10 px-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

import type { ReactNode } from "react";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "className">,
    VariantProps<typeof inputVariants> {
  label?: ReactNode;
  description?: ReactNode;
  info?: string | undefined;
  errors?: string[] | undefined;
  inline?: boolean | undefined;
  className?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, description, info, errors, inline, size, type, ...props }, ref) => {
    const input = (
      <input
        type={type}
        className={cn(
          inputVariants({ size, className }),
          errors && errors.length > 0 && "border-destructive",
        )}
        ref={ref}
        {...props}
      />
    );

    if (label || description || errors) {
      return (
        <FormField
          label={label}
          description={description}
          info={info}
          errors={errors}
          inline={inline}
        >
          {input}
        </FormField>
      );
    }

    return input;
  },
);
Input.displayName = "Input";

export { Input };
