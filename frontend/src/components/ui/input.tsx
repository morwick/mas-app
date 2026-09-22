import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes
} from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  leftIcon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, leftIcon, rightAddon, style, ...rest },
  ref
) {
  if (leftIcon || rightAddon) {
    return (
      <div className="w-full">
        <div style={{ position: "relative" }}>
          {leftIcon && (
            <div
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center"
              }}
            >
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={cn("input", className)}
            style={{
              paddingLeft: leftIcon ? 36 : undefined,
              paddingRight: rightAddon ? 40 : undefined,
              borderColor: error ? "#c13838" : undefined,
              ...style
            }}
            {...rest}
          />
          {rightAddon && (
            <div
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center"
              }}
            >
              {rightAddon}
            </div>
          )}
        </div>
        {error && (
          <p className="field-error" style={{ marginTop: 4 }}>
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="w-full">
      <input
        ref={ref}
        className={cn("input", className)}
        style={{ borderColor: error ? "#c13838" : undefined, ...style }}
        {...rest}
      />
      {error && (
        <p className="field-error" style={{ marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, error, rows = 3, style, ...rest }, ref) {
    return (
      <div className="w-full">
        <textarea
          ref={ref}
          rows={rows}
          className={cn("textarea", className)}
          style={{ borderColor: error ? "#c13838" : undefined, ...style }}
          {...rest}
        />
        {error && (
          <p className="field-error" style={{ marginTop: 4 }}>
            {error}
          </p>
        )}
      </div>
    );
  }
);

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, error, children, style, ...rest }, ref) {
    return (
      <div className="w-full">
        <select
          ref={ref}
          className={cn("select", className)}
          style={{ borderColor: error ? "#c13838" : undefined, ...style }}
          {...rest}
        >
          {children}
        </select>
        {error && (
          <p className="field-error" style={{ marginTop: 4 }}>
            {error}
          </p>
        )}
      </div>
    );
  }
);

interface FieldProps {
  label?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({
  label,
  required,
  hint,
  children,
  className
}: FieldProps) {
  return (
    <div className={cn("field", className)}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="field-helper">{hint}</p>}
    </div>
  );
}
