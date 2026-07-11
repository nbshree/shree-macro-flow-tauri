'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full border border-input bg-[var(--surface-input)] shadow-xs outline-none transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[22px] data-[size=default]:w-10 data-[size=sm]:h-[18px] data-[size=sm]:w-8 data-[state=checked]:border-ui-primary data-[state=checked]:bg-ui-primary data-[state=unchecked]:bg-[var(--surface-input)] dark:data-[state=unchecked]:bg-input/80',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-muted-foreground ring-0 transition-[background-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3.5 group-data-[size=default]/switch:data-[state=checked]:translate-x-[20px] group-data-[size=default]/switch:data-[state=unchecked]:translate-x-[2px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[16px] group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-px data-[state=checked]:bg-ui-primary-foreground dark:data-[state=checked]:bg-ui-primary-foreground dark:data-[state=unchecked]:bg-foreground'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
