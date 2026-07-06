import { ChevronDown, X } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"

import { zIndex } from "../../tokens/zIndex.ts"
import { cn } from "../../utils/cn.ts"
import { FormField, type FormFieldProps } from "../form-field/form-field.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "../popover/primitives.tsx"
import { Skeleton } from "../skeleton/skeleton.tsx"
import { Text } from "../text/text.tsx"
import {
  SelectContent,
  type SelectContentProps,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectTriggerSurface,
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

const searchableSelectContentClassName = cn(
  "relative min-w-32 max-h-72 overflow-hidden rounded-xl border bg-popover p-0 text-popover-foreground shadow-md",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
)

type SelectFooterAction = {
  label: string
  icon?: ReactNode
  onClick: () => void
}

function SelectFooterAction({ footerAction }: { footerAction: SelectFooterAction }) {
  return (
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
  )
}

export type SelectProps<V = unknown> = Omit<FormFieldProps, "children"> &
  Pick<SelectContentProps, "side" | "sideOffset" | "align" | "alignOffset"> & {
    name: string
    options: SelectOption<V>[]
    defaultValue?: V | undefined
    value?: V | undefined
    trigger?: ReactNode
    placeholder?: string
    placeholderIcon?: ReactNode
    loading?: boolean
    disabled?: boolean
    required?: boolean
    onChange?: (value: V) => void
    width?: "auto" | "full"
    contentWidth?: "auto" | "trigger"
    contentClassName?: string
    /** Extra classes merged onto the trigger, e.g. to align radius/padding with adjacent buttons. */
    triggerClassName?: string
    size?: "small" | "default"
    removable?: boolean
    searchable?: boolean
    searchPlaceholder?: string
    searchableEmptyMessage?: string
    searchLoading?: boolean
    wrapSearchableOptionText?: boolean
    onSearch?: (search: string) => void
    infiniteScroll?: {
      hasMore: boolean
      isLoadingMore: boolean
      onLoadMore: () => void
    }
    open?: boolean
    onOpenChange?: (open: boolean) => void
    footerAction?: SelectFooterAction
  }

export function Select<V = unknown>(selectProps: SelectProps<V>) {
  // `value !== undefined` is wrong when callers use `value={x ?? undefined}` for "empty":
  // that flips to uncontrolled after clear and triggers React / Radix warnings.
  const isControlled = Object.hasOwn(selectProps, "value")
  const {
    name,
    label,
    description,
    errors,
    trigger,
    placeholder,
    placeholderIcon,
    options,
    defaultValue,
    value,
    info,
    onChange,
    width = "full",
    contentWidth = "auto",
    contentClassName,
    triggerClassName,
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
    wrapSearchableOptionText = false,
    onSearch,
    infiniteScroll,
    searchPlaceholder,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    footerAction,
  } = selectProps
  const [internalSelected, setInternalSelected] = useState<V | undefined>(defaultValue)
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  const selectedValue = isControlled ? value : internalSelected
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalIsOpen
  const setIsOpen = controlledOnOpenChange ?? setInternalIsOpen

  const hasSelection = selectedValue !== undefined && selectedValue !== null && String(selectedValue) !== ""
  const formValue =
    selectedValue === undefined || selectedValue === null || selectedValue === ("" as V) ? "" : String(selectedValue)

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

  const triggerContent = trigger ?? (
    <SelectValue
      selected={selectedValue}
      options={options}
      placeholder={placeholder ?? "Select an option"}
      placeholderIcon={placeholderIcon}
    />
  )

  const searchableList = (
    <SearchableSelectList<V>
      loading={searchLoading}
      options={options}
      onChange={_onChange}
      searchMode={onSearch ? "server" : "client"}
      wrapOptionText={wrapSearchableOptionText}
      {...(infiniteScroll ? { infiniteScroll } : {})}
      {...(onSearch ? { onSearchChange: onSearch } : {})}
      {...(searchPlaceholder ? { searchPlaceholder } : {})}
      {...(searchableEmptyMessage ? { searchableEmptyMessage } : {})}
      {...(hasSelection ? { selectedValue } : {})}
    />
  )

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
        ) : searchable ? (
          <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
            <PopoverTrigger asChild disabled={disabled || loading}>
              {trigger ? (
                trigger
              ) : (
                <SelectTriggerSurface
                  size={size}
                  aria-expanded={isOpen}
                  data-disabled={disabled || loading ? "" : undefined}
                  className={cn({ "border-red-500 focus:ring-red-500": errors }, triggerClassName)}
                  trailing={
                    removable && hasSelection && !disabled && !loading ? (
                      <button
                        type="button"
                        aria-label="Clear selection"
                        className="cursor-pointer rounded-sm opacity-50 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          _onRemove()
                        }}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                    )
                  }
                >
                  {triggerContent}
                </SelectTriggerSurface>
              )}
            </PopoverTrigger>
            <PopoverContent
              data-slot="searchable-select-content"
              align={align}
              side={side}
              {...(sideOffset !== undefined ? { sideOffset } : { sideOffset: 4 })}
              {...(alignOffset !== undefined ? { alignOffset } : {})}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              onWheel={(event) => event.stopPropagation()}
              className={cn(
                searchableSelectContentClassName,
                zIndex.dropdown,
                contentWidth === "trigger"
                  ? "w-(--radix-popover-trigger-width) min-w-(--radix-popover-trigger-width)"
                  : "w-auto min-w-32",
                contentClassName,
              )}
            >
              {searchableList}
              {footerAction ? <SelectFooterAction footerAction={footerAction} /> : null}
            </PopoverContent>
            <input type="hidden" name={name} value={formValue} {...(required ? { required: true } : {})} />
          </Popover>
        ) : (
          <SelectRoot
            open={isOpen}
            required={required}
            disabled={disabled || loading}
            name={name}
            {...(isControlled ? { value: formValue } : {})}
            onValueChange={_onChange}
            onOpenChange={setIsOpen}
          >
            {trigger ? (
              trigger
            ) : (
              <SelectTrigger
                size={size}
                className={cn({ "border-red-500 focus:ring-red-500": errors }, triggerClassName)}
                removable={removable && hasSelection && !disabled && !loading}
                onRemove={_onRemove}
              >
                {triggerContent}
              </SelectTrigger>
            )}
            <SelectContent
              align={align}
              side={side}
              {...(sideOffset !== undefined ? { sideOffset } : {})}
              {...(alignOffset !== undefined ? { alignOffset } : {})}
              className={cn(
                zIndex.dropdown,
                "p-0",
                {
                  "w-(--radix-select-trigger-width)": contentWidth === "trigger",
                },
                contentClassName,
              )}
            >
              <SelectGroup>
                <Options options={options as SelectOption<V>[]} />
              </SelectGroup>
              {footerAction ? <SelectFooterAction footerAction={footerAction} /> : null}
            </SelectContent>
          </SelectRoot>
        )}
      </div>
    </FormField>
  )
}

export * from "./primitives.tsx"
