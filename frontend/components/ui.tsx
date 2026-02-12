"use client";

import { cx } from "@/lib/cx";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("card p-5", className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-white/5 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {helper ? <div className="mt-1 text-xs text-muted">{helper}</div> : null}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse">{children}</table>
    </div>
  );
}

export function Th(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const { children, className, ...rest } = props;
  return (
    <th
      {...rest}
      className={cx(
        "border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const { children, className, ...rest } = props;
  return (
    <td {...rest} className={cx("border-b border-border px-3 py-3 text-sm", className)}>
      {children}
    </td>
  );
}
