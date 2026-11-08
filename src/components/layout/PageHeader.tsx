import type { ReactNode } from 'react';
import clsx from 'clsx';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
        ) : null}
        <h1 className="display text-[30px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[38px]">{title}</h1>
        {description ? (
          <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-soft sm:text-[13.5px]">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
