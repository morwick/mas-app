"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  leftIcon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, leftIcon, rightAddon, ...rest },
  ref
) {
  return (
    <div className="w-full">
      <div
        className={cn(
          "flex items-center w-full rounded-md bg-white border border-border focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20 transition",
          error && "border-danger focus-within:border-danger focus-within:ring-danger/20",
          rest.disabled && "opacity-60 bg-page"
        )}
      >
        {leftIcon && <span className="pl-3 text-text-muted">{leftIcon}</span>}
        <input
          ref={ref}
          className={cn(
            "flex-1 bg-transparent outline-none px-3 h-10 text-[14px] placeholder:text-text-subtle",
            leftIcon && "pl-2",
            rightAddon && "pr-2",
            className
          )}
          {...rest}
        />
        {rightAddon && <span className="pr-1">{rightAddon}</span>}
      </div>
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, rows = 3, ...rest },
  ref
) {
  return (
    <div className="w-full">
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          "w-full rounded-md bg-white border border-border px-3 py-2 text-[14px] outline-none placeholder:text-text-subtle focus:border-brand focus:ring-[3px] focus:ring-brand/20 transition resize-y",
          error && "border-danger focus:border-danger focus:ring-danger/20",
          rest.disabled && "opacity-60 bg-page",
          className
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </div>
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error, children, ...rest },
  ref
) {
  return (
    <div className="w-full">
      <select
        ref={ref}
        className={cn(
          "w-full rounded-md bg-white border border-border px-3 h-10 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/20 transition appearance-none bg-no-repeat bg-right pr-8",
          error && "border-danger focus:border-danger focus:ring-danger/20",
          rest.disabled && "opacity-60 bg-page",
          className
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B6B66' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
          backgroundSize: "16px",
          backgroundPosition: "right 10px center"
        }}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </div>
  );
});

interface FieldProps {
  label?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, required, hint, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[13px] font-medium text-text">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}
