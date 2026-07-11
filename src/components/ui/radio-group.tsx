import * as React from 'react'
import { CircleIcon } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-2', className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'aspect-square size-4 shrink-0 cursor-pointer rounded-full border border-input bg-[var(--surface-input)] text-ui-primary shadow-xs outline-none transition-[border-color,background-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-ui-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
