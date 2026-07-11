import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex min-h-[23px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[11px] font-bold whitespace-nowrap outline-none transition-[border-color,background-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-ui-primary text-ui-primary-foreground [a&]:hover:bg-ui-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline:
          'border-border text-foreground [a&]:hover:bg-ui-accent [a&]:hover:text-ui-accent-foreground',
        ghost: '[a&]:hover:bg-ui-accent [a&]:hover:text-ui-accent-foreground',
        link: 'text-ui-primary underline-offset-4 [a&]:hover:underline'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
