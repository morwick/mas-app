"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-dark active:scale-[0.98] disabled:opacity-50",
  secondary:
    "bg-white text-text border border-border hover:border-border-hover active:scale-[0.98] disabled:opacity-50",
  danger:
    "bg-danger text-white hover:bg-danger-dark active:scale-[0.98] disabled:opacity-50",
  ghost:
    "bg-transparent text-brand hover:bg-brand-light active:scale-[0.98] disabled:opacity-50"
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-12 px-5 text-[16px]"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    fullWidth,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 no-tap-highlight select-none",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        leftIcon && <span className="inline-flex">{leftIcon}</span>
      )}
      {children}
      {!loading && rightIcon && <span className="inline-flex">{rightIcon}</span>}
    </button>
  );
});
