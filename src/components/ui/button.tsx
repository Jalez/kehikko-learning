import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils.ts'

/**
 * shadcn's button, with one size added and `whitespace-nowrap` taken out of the
 * base — and the second is the load-bearing change.
 *
 * `container` is a target sized for a container 220 pixels wide, and it is a variant
 * rather than a set of overrides at each call site so that every press on this
 * page is the same height. The default `sm` is 32 pixels tall and fine on a
 * page; in a narrow column beside twelve questions it eats the column.
 *
 * ## Why the base wraps
 *
 * Every option in this module is a button, and an option is a phrase somebody
 * wrote — "because a second table for four short strings costs more to read than
 * it saves" is a real one. shadcn's base carries `whitespace-nowrap`, which does
 * not merely refuse to wrap: it makes the element's MIN-CONTENT WIDTH the full
 * width of its text, and min-content propagates up through every ancestor that
 * is not explicitly `min-w-0`. One option would therefore set a floor under the
 * whole container and make it scroll sideways at every width below it. That floor was
 * measured at 1187 pixels in a 220-pixel container in another module here.
 *
 * So the base wraps and `justify-start text-left` comes with it, because a
 * wrapped label centred over three lines is unreadable. Buttons whose label
 * really is one short word — "Retake", "Next" — opt back in at their call site
 * with `whitespace-nowrap`, which `tailwind-merge` lets a later class win.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border bg-transparent hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3',
        container: 'h-6 rounded px-2 text-xs',
        /** An option: as tall as its wrapped label needs, and left-aligned. */
        option: 'min-h-7 w-full justify-start rounded px-2 py-1 text-left text-xs [overflow-wrap:anywhere]',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
