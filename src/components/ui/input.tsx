import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-[35px] w-full min-w-0 rounded-md border border-input bg-[var(--surface-input)] px-2.5 py-1 text-xs text-foreground shadow-xs outline-none transition-[border-color,background-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] selection:bg-ui-primary selection:text-ui-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground hover:not-disabled:border-[var(--border-strong)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--surface-input-disabled)] disabled:opacity-70 data-[size=compact]:h-[30px] data-[size=compact]:rounded-[5px] data-[size=compact]:px-2 data-[size=compact]:text-[11px] dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className
      )}
      {...props}
    />
  )
}

export { Input }
