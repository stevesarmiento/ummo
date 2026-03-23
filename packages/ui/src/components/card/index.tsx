import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Card component for displaying content in a contained card layout.
 */
function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>, ref: React.ForwardedRef<HTMLDivElement>) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>, ref: React.ForwardedRef<HTMLDivElement>) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>, ref: React.ForwardedRef<HTMLDivElement>) {
  return (
    <div
      ref={ref}
      className={cn(
        "text-2xl font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>, ref: React.ForwardedRef<HTMLDivElement>) {
  return (
    <div
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>, ref: React.ForwardedRef<HTMLDivElement>) {
  return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>, ref: React.ForwardedRef<HTMLDivElement>) {
  return (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  );
}

const ForwardedCard = React.forwardRef(Card);
const ForwardedCardHeader = React.forwardRef(CardHeader);
const ForwardedCardTitle = React.forwardRef(CardTitle);
const ForwardedCardDescription = React.forwardRef(CardDescription);
const ForwardedCardContent = React.forwardRef(CardContent);
const ForwardedCardFooter = React.forwardRef(CardFooter);

ForwardedCard.displayName = "Card";
ForwardedCardHeader.displayName = "CardHeader";
ForwardedCardTitle.displayName = "CardTitle";
ForwardedCardDescription.displayName = "CardDescription";
ForwardedCardContent.displayName = "CardContent";
ForwardedCardFooter.displayName = "CardFooter";

export {
  ForwardedCard as Card,
  ForwardedCardHeader as CardHeader,
  ForwardedCardFooter as CardFooter,
  ForwardedCardTitle as CardTitle,
  ForwardedCardDescription as CardDescription,
  ForwardedCardContent as CardContent,
};
