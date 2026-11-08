import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';

export { clsx as cx };

/* ------------------------------------------------------------------ button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-canvas hover:bg-ink/90 active:scale-[.985] shadow-sm disabled:bg-ink/40',
  secondary:
    'bg-surface text-ink border border-line hover:bg-raised active:scale-[.985] shadow-sm',
  ghost: 'text-soft hover:text-ink hover:bg-ink/[.055] active:bg-ink/[.08]',
  quiet: 'text-faint hover:text-ink hover:bg-ink/[.05]',
  danger:
    'bg-danger text-white hover:brightness-105 active:scale-[.985] shadow-sm disabled:opacity-50',
  gold:
    'bg-accent text-accent-ink hover:brightness-105 active:scale-[.985] shadow-sm disabled:opacity-50',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[13.5px] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, icon, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.01em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'default' | 'danger' | 'accent';
  active?: boolean;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = 'default', active, size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx(
        'inline-flex select-none items-center justify-center rounded-lg transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-9 w-9' : 'h-7 w-7',
        active
          ? 'bg-ink text-canvas shadow-sm'
          : tone === 'danger'
            ? 'text-soft hover:bg-danger-soft hover:text-danger'
            : tone === 'accent'
              ? 'text-soft hover:bg-accent-soft hover:text-accent'
              : 'text-soft hover:bg-ink/[.055] hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------- card */

export function Card({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'article' | 'aside';
}) {
  return <Tag className={clsx('card', className)}>{children}</Tag>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="display truncate text-[22px] leading-tight text-ink sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-soft">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- chips */

export function Chip({
  children,
  tone = 'default',
  className,
  onClick,
  active,
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'danger' | 'success' | 'neutral';
  className?: string;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const tones: Record<string, string> = {
    default: 'border-line bg-surface text-soft',
    neutral: 'border-transparent bg-ink/[.06] text-soft',
    accent: 'border-accent/25 bg-accent-soft text-accent',
    danger: 'border-danger/20 bg-danger-soft text-danger',
    success: 'border-success/20 bg-success-soft text-success',
  };
  const base = clsx(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none',
    tones[tone],
    active && 'ring-1 ring-accent/40',
    onClick && 'cursor-pointer transition-colors hover:border-accent/50 hover:text-ink',
    className,
  );
  if (onClick) {
    return (
      <button type="button" title={title} onClick={onClick} className={base}>
        {children}
      </button>
    );
  }
  return (
    <span title={title} className={base}>
      {children}
    </span>
  );
}

export function ScorePill({ score, className }: { score: number; className?: string }) {
  const tone = score >= 72 ? 'text-success' : score >= 48 ? 'text-accent' : 'text-danger';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full bg-ink/70 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white backdrop-blur',
        className,
      )}
      title={`Quality score ${score} of 100`}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', tone === 'text-success' ? 'bg-success' : tone === 'text-accent' ? 'bg-accent' : 'bg-danger')} />
      {score}
    </span>
  );
}

/* ---------------------------------------------------------------- progress */

export function ProgressBar({
  value,
  max = 100,
  className,
  tone = 'accent',
  indeterminate,
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: 'accent' | 'success' | 'danger';
  indeterminate?: boolean;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const colors = { accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger' };
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-ink/[.08]', className)}>
      <div
        className={clsx(
          'h-full rounded-full transition-[width] duration-300',
          colors[tone],
          indeterminate && 'animate-pulse-soft',
        )}
        style={{ width: `${indeterminate ? Math.max(6, pct) : pct}%` }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-accent', className)} />;
}

/* ------------------------------------------------------------------ inputs */

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-[12px] font-medium text-soft">
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-[11.5px] text-danger">{error}</p> : hint ? <p className="text-[11.5px] leading-relaxed text-faint">{hint}</p> : null}
    </div>
  );
}

const controlBase =
  'w-full rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink placeholder:text-faint shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)] transition-colors focus:border-accent focus:outline-none disabled:opacity-60';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={clsx(controlBase, 'h-10', className)} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(controlBase, 'min-h-24 resize-y py-2.5 leading-relaxed', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={clsx(controlBase, 'h-10 cursor-pointer appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={clsx('flex items-start justify-between gap-4', disabled && 'opacity-60')}>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-[13px] font-medium text-ink">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line bg-ink/[.08]',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[19px]' : 'translate-x-0.5',
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </div>
  );
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  formatValue,
  disabled,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: ReactNode;
  formatValue?: (value: number) => string;
  disabled?: boolean;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={clsx('space-y-2', disabled && 'opacity-50')}>
      {label || formatValue ? (
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium text-soft">{label}</span>
          <span className="tabular-nums text-faint">{formatValue ? formatValue(value) : value}</span>
        </div>
      ) : null}
      <input
        type="range"
        aria-label={typeof label === 'string' ? label : 'Value'}
        className="range-fill w-full cursor-pointer appearance-none"
        style={{ ['--fill' as string]: `${fill}%` }}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ modals */

function useLockBody(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}) {
  useLockBody(open);
  useEscape(open, onClose);
  if (!open) return null;
  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
    full: 'max-w-[min(1200px,94vw)]',
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[3px] animate-fade-in dark:bg-black/65"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={clsx(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl2 border border-line bg-surface shadow-lift animate-scale-in sm:rounded-xl2',
          widths[size],
          className,
        )}
      >
        {title ? (
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 className="display text-xl text-ink">{title}</h2>
              {description ? <p className="mt-1 text-[12.5px] leading-relaxed text-soft">{description}</p> : null}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </header>
        ) : (
          <IconButton label="Close" onClick={onClose} className="absolute right-3 top-3 z-20 bg-surface/80 backdrop-blur">
            <X className="h-4 w-4" />
          </IconButton>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <footer className="border-t border-line bg-raised/50 px-5 py-3.5 sm:px-6">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  useLockBody(open);
  useEscape(open, onClose);
  if (!open) return null;
  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' };
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px] animate-fade-in dark:bg-black/60" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Panel'}
        className={clsx(
          'absolute bottom-0 right-0 top-0 flex w-full flex-col border-l border-line bg-surface shadow-lift animate-fade-in',
          widths[width],
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="display truncate text-xl text-ink">{title}</h2> : null}
            {subtitle ? <div className="mt-1 text-[12px] text-soft">{subtitle}</div> : null}
          </div>
          <IconButton label="Close panel" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-3.5">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------- empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-xl2 border border-dashed border-line bg-surface/50 text-center',
        compact ? 'px-6 py-10' : 'px-8 py-20',
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        {icon}
      </div>
      <h3 className="display text-xl text-ink">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-[13px] leading-relaxed text-soft">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs */

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={clsx('inline-flex items-center gap-0.5 rounded-xl border border-line bg-raised p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-all',
            size === 'sm' ? 'h-7 px-2.5 text-[11.5px]' : 'h-8 px-3 text-[12.5px]',
            value === option.value
              ? 'bg-surface text-ink shadow-sm'
              : 'text-faint hover:text-soft',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
