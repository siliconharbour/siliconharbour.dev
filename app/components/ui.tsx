import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

type Tone = "primary" | "secondary" | "ghost" | "danger" | "warning" | "success";
type Size = "sm" | "md";

const buttonTones: Record<Tone, string> = {
  primary: "bg-harbour-600 text-white hover:bg-harbour-700",
  secondary: "bg-harbour-100 text-harbour-700 hover:bg-harbour-200",
  ghost: "text-harbour-600 hover:bg-harbour-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  warning: "bg-amber-500 text-white hover:bg-amber-600",
  success: "bg-green-600 text-white hover:bg-green-700",
};

const buttonSizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2",
};

export function buttonClassName({
  tone = "primary",
  size = "md",
  className = "",
}: {
  tone?: Tone;
  size?: Size;
  className?: string;
} = {}) {
  return `${buttonSizes[size]} ${buttonTones[tone]} font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim();
}

export function Button({
  tone,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: Size }) {
  return <button className={buttonClassName({ tone, size, className })} {...props} />;
}

export function ButtonLink({
  tone,
  size,
  className,
  ...props
}: LinkProps & { tone?: Tone; size?: Size }) {
  return <Link className={buttonClassName({ tone, size, className })} {...props} />;
}

type BadgeTone = "default" | "success" | "warning" | "danger" | "muted" | "remote";

const badgeTones: Record<BadgeTone, string> = {
  default: "bg-harbour-100 text-harbour-600",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  muted: "bg-slate-100 text-slate-600",
  remote: "bg-purple-100 text-purple-700",
};

export function Badge({
  tone = "default",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-xs px-1.5 py-0.5 ${badgeTones[tone]} ${className}`.trim()}>
      {children}
    </span>
  );
}

type AlertTone = "info" | "success" | "warning" | "danger";

const alertTones: Record<AlertTone, string> = {
  info: "bg-harbour-50 border-harbour-200 text-harbour-700",
  success: "bg-green-50 border-green-200 text-green-700",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  danger: "bg-red-50 border-red-200 text-red-700",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`p-4 border ${alertTones[tone]}`}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className="text-sm">{children}</div>
    </div>
  );
}
