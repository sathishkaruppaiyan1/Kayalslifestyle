import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Reference storefront: Jost 600, uppercase, 5px radius, 13px.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-semibold uppercase tracking-wide font-body ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Gold fill, the site's primary call to action.
        default: "bg-primary text-primary-foreground hover:bg-brand-ink",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent text-foreground hover:border-primary hover:text-brand-ink hover:bg-brand-tint",
        secondary: "bg-secondary text-secondary-foreground hover:bg-brand-tint hover:text-brand-ink",
        ghost: "rounded-md hover:bg-muted hover:text-foreground normal-case tracking-normal",
        link: "text-brand-ink underline-offset-4 hover:underline hover:text-primary normal-case tracking-normal",
        icon: "rounded-full hover:bg-muted hover:text-brand-ink normal-case tracking-normal",
        // Dark counterpart to the gold button, for "add to cart" pairs.
        addToCart: "bg-foreground text-background hover:bg-primary hover:text-primary-foreground",
        buyNow: "bg-primary text-primary-foreground hover:bg-brand-ink",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-8 text-sm",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },

);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
