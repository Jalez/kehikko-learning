import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils.ts'

/**
 * shadcn's badge, with `whitespace-nowrap` REMOVED from the base, deliberately.
 *
 * ## The trap, which is not hypothetical
 *
 * shadcn ships this component with `whitespace-nowrap` in its base class list,
 * and in the normal case that is right: a badge saying "draft" or "over MCP" is
 * two words and a badge that wraps to two lines reads as two badges. Checklist
 * keeps it for exactly that reason and says so.
 *
 * It cannot stay here. `white-space: nowrap` does not merely refuse to wrap — it
 * makes the element's MIN-CONTENT WIDTH the full width of its text, and
 * min-content propagates up through every ancestor that is not explicitly
 * `min-w-0`. So one badge with a long string in it sets a floor under the whole
 * pane, and the pane scrolls sideways at every width below that floor. In
 * another module in this workspace that floor was measured at 1187 pixels, in a
 * pane 220 wide.
 *
 * Everything this module puts in a badge is one of those long strings: the path
 * of a document, an epic slug, an option somebody wrote as a full clause, and
 * above all the quoted source a question is anchored to. There is no width at
 * which "src/papers/modes-are-modules/chapters/extraction.tex" is two words.
 *
 * So the base wraps, and the two variants that genuinely are short — the verdict
 * marks, which say "right" and "wrong" and nothing else — opt back IN with
 * `nowrap: true` at their call site. That is the correct default direction: a
 * component that wraps by default is one whose worst case is an ugly line break,
 * and one that does not is a component whose worst case is a broken layout at
 * every width. The test at 220px asserts the result rather than the technique.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded border px-1.5 py-px text-[0.65rem] font-medium leading-4 [overflow-wrap:anywhere]',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        outline: 'text-muted-foreground',
        right: 'border-right/40 bg-right/10 text-right',
        wrong: 'border-wrong/40 bg-wrong/10 text-wrong',
        unasked: 'border-unasked/40 text-unasked',
      },
      /**
       * For the marks that really are one short word.
       *
       * `shrink-0` travels with it, because an element that will not wrap and
       * also will not shrink is the pair that actually holds a row open — either
       * alone is survivable.
       */
      nowrap: { true: 'shrink-0 whitespace-nowrap', false: '' },
    },
    defaultVariants: { variant: 'default', nowrap: false },
  },
)

function Badge({
  className,
  variant,
  nowrap,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, nowrap }), className)} {...props} />
}

export { Badge, badgeVariants }
