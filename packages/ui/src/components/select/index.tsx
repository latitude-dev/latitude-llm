import type { ReactNode } from "react"
import { useState } from "react"

import { zIndex } from "../../tokens/zIndex.ts"
import { cn } from "../../utils/cn.ts"
import { FormField, type FormFieldProps } from "../form-field/form-field.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"
import {
  SelectContent,
  type SelectContentProps,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "./primitives.tsx"
import { SearchableSelectList } from "./searchable-list.tsx"

export type SelectOption<V = unknown> = {
  label: string
  value: V
  icon?: ReactNode
  disabled?: boolean
}

export type SelectOptionGroup<V = unknown> = {
  label: string
  options: SelectOption<V>[]
}

function Options({ options }: { options: SelectOption[] }) {
  return options.map((option) => (
    <SelectItem
      key={String(option.value)}
      value={String(option.value)}
      icon={option.icon}
      {...(option.disabled ? { disabled: true } : {})}
    >
      {option.label}
    </SelectItem>
  ))
}

export type SelectProps<V = unknown> = Omit<FormFieldProps, "children"> &
  Pick<SelectContentProps, "side" | "sideOffset" | "align" | "alignOffset"> & {
    name: string
    options: SelectOption<V>[]
    defaultValue?: V | undefined
    value?: V | undefined
    trigger?: ReactNode
    placeholder?: string
    loading?: boolean
    disabled?: boolean
    required?: boolean
    onChange?: (value: V) => void
    width?: "auto" | "full"
    size?: "small" | "default"
    removable?: boolean
    searchable?: boolean
    searchPlaceholder?: string
    searchableEmptyMessage?: string
    searchLoading?: boolean
    onSearch?: (search: string) => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
    footerAction?: {
      label: string
      icon?: ReactNode
      onClick: () => void
    }
  }

export function Select<V = unknown>({
  name,
  label,
  description,
  errors,
  trigger,
  placeholder,
  options,
  defaultValue,
  value,
  info,
  onChange,
  width = "full",
  size = "default",
  align = "start",
  alignOffset,
  side = "top",
  sideOffset,
  loading = false,
  disabled = false,
  required = false,
  removable = false,
  searchable = false,
  searchableEmptyMessage,
  searchLoading = false,
  onSearch,
  searchPlaceholder,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  footerAction,
}: SelectProps<V>) {
  const isControlled = value !== undefined
  const [internalSelected, setInternalSelected] = useState<V | undefined>(defaultValue)
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  const selectedValue = isControlled ? value : internalSelected
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalIsOpen
  const setIsOpen = controlledOnOpenChange ?? setInternalIsOpen

  const _onChange = (newValue: string) => {
    if (!isControlled) {
      setInternalSelected(newValue as V)
    }
    if (onChange) onChange(newValue as V)
    setIsOpen(false)
  }

  const _onRemove = () => {
    if (!isControlled) {
      setInternalSelected(undefined)
    }
    if (onChange) onChange(undefined as V)
    setIsOpen(false)
  }

  return (
    <FormField
      label={label}
      info={info}
      description={description}
      errors={errors}
      className={width === "full" ? "w-full" : "w-auto"}
    >
      <div className={width === "full" ? "w-full" : "w-auto"}>
        {loading ? (
          <Skeleton
            className={cn("h-8 rounded-lg", {
              "min-w-56": width === "auto",
              "w-full": width === "full",
            })}
          />
        ) : (
          <SelectRoot
            open={isOpen}
            required={required}
            disabled={disabled || loading}
            name={name}
            value={selectedValue !== undefined ? String(selectedValue) : undefined}
            {...(searchable ? {} : { onValueChange: _onChange })}
            onOpenChange={setIsOpen}
          >
            {trigger ? (
              trigger
            ) : (
              <SelectTrigger
                size={size}
                className={cn({ "border-red-500 focus:ring-red-500": errors })}
                removable={removable && !!selectedValue && !disabled && !loading}
                onRemove={_onRemove}
              >
                <SelectValue
                  selected={selectedValue}
                  options={options}
                  placeholder={placeholder ?? "Select an option"}
                />
              </SelectTrigger>
            )}
            <SelectContent
              align={align}
              side={side}
              {...(sideOffset !== undefined ? { sideOffset } : {})}
              {...(alignOffset !== undefined ? { alignOffset } : {})}
              className={cn(zIndex.dropdown, "p-0")}
            >
              {searchable ? (
                <SearchableSelectList<V>
                  loading={searchLoading}
                  options={options}
                  onChange={_onChange}
                  {...(onSearch ? { onSearchChange: onSearch } : {})}
                  {...(searchPlaceholder ? { searchPlaceholder } : {})}
                  {...(searchableEmptyMessage ? { searchableEmptyMessage } : {})}
                  {...(selectedValue !== undefined ? { selectedValue } : {})}
                />
              ) : (
                <SelectGroup>
                  <Options options={options as SelectOption<V>[]} />
                </SelectGroup>
              )}
              {footerAction ? (
                <div className="sticky bottom-0 border-t border-border pt-1">
                  <button
                    type="button"
                    onClick={footerAction.onClick}
                    className={cn(
                      "cursor-pointer flex items-center justify-center",
                      "gap-1 py-1.5 px-2 w-full rounded-b-lg bg-muted hover:bg-accent",
                    )}
                  >
                    {footerAction.icon}
                    <Text.H6>{footerAction.label}</Text.H6>
                  </button>
                </div>
              ) : null}
            </SelectContent>
          </SelectRoot>
        )}
      </div>
    </FormField>
  )
}

export * from "./primitives.tsx"
