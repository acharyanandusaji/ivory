import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

export function Toaster() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  const undoLast = useAppStore((state) => state.undoLast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 safe-bottom">
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'default';
        const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? AlertCircle : Info;
        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface/95 p-3.5 shadow-lift backdrop-blur animate-fade-up',
              tone === 'success' ? 'border-success/30' : tone === 'danger' ? 'border-danger/30' : 'border-line',
            )}
            role="status"
          >
            <Icon
              className={clsx(
                'mt-0.5 h-4 w-4 shrink-0',
                tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-accent',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug text-ink">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-soft">{toast.description}</p>
              ) : null}
              {toast.action ? (
                <button
                  type="button"
                  className="mt-2 text-[11.5px] font-semibold text-accent story-link"
                  onClick={() => {
                    toast.action?.run();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-ink/[.06] hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {toasts.length > 1 ? (
        <button
          type="button"
          onClick={() => void undoLast()}
          className="pointer-events-auto self-end rounded-full border border-line bg-surface px-3 py-1 text-[10.5px] text-faint shadow-sm hover:text-ink"
        >
          Undo last change
        </button>
      ) : null}
    </div>
  );
}
