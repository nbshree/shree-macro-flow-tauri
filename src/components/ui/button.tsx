import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-bold outline-none transition-[border-color,background-color,color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:translate-y-px focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:active:translate-y-0 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border border-ui-primary bg-ui-primary text-ui-primary-foreground hover:border-[var(--color-primary-hover)] hover:bg-[var(--color-primary-hover)]',
        destructive:
          'border border-destructive bg-destructive text-white hover:border-[var(--color-danger-hover)] hover:bg-[var(--color-danger-hover)] focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'border border-input bg-[var(--surface-input)] text-secondary-foreground shadow-xs hover:border-[var(--border-strong)] hover:bg-ui-accent hover:text-ui-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-ui-accent hover:text-ui-accent-foreground dark:hover:bg-ui-accent/50',
        link: 'text-ui-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-[35px] px-3 has-[>svg]:px-2.5',
        compact: 'h-[30px] gap-1.5 rounded-[5px] px-2.5 text-[11px] has-[>svg]:px-2',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-[35px]',
        'icon-compact': "size-[30px] rounded-[5px] [&_svg:not([class*='size-'])]:size-3.5",
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
