import { type ReactNode, useId } from "react";

import { cn } from "../../utils/cn.js";
import { Label } from "../label/label.js";
import { Text } from "../text/text.js";

export interface FormFieldProps {
  children: ReactNode;
  label?: ReactNode;
  description?: ReactNode;
  info?: string | undefined;
  inline?: boolean | undefined;
  errors?: string[] | undefined;
  className?: string | undefined;
}

function FormField({
  children,
  label,
  description,
  info,
  inline = false,
  errors,
  className,
}: FormFieldProps) {
  const hasError = errors && errors.length > 0;
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;

  return (
    <div className={cn("flex gap-2", inline ? "flex-row items-center" : "flex-col", className)}>
      {label && (
        <div className={cn("flex flex-col gap-1", inline && "shrink-0")}>
          <div className="flex items-center gap-2">
            <Label htmlFor={id}>{label}</Label>
            {info && <Text.H6 className="text-muted-foreground">{info}</Text.H6>}
          </div>
          {description && !inline && (
            <Text.H6 id={descriptionId} className="text-muted-foreground">
              {description}
            </Text.H6>
          )}
        </div>
      )}
      <div className="flex-1">
        {children}
        {hasError && (
          <div id={errorId} role="alert" className="mt-1 flex flex-col gap-1">
            {errors.map((error) => (
              <Text.H6 key={error} color="destructive">
                {error}
              </Text.H6>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { FormField };
