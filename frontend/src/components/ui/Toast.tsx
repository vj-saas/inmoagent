import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

/** Default NO-OP: una página renderizada sin provider en un test no explota. */
const noopToastContext: ToastContextValue = { showToast: () => {} };

const ToastContext = createContext<ToastContextValue>(noopToastContext);

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const toneClasses: Record<ToastTone, string> = {
  info: 'border-info/30 bg-surface text-info',
  success: 'border-success/30 bg-surface text-success',
  warning: 'border-warning/30 bg-surface text-warning',
  danger: 'border-danger/30 bg-surface text-danger',
};

export interface ToastProviderProps {
  children: ReactNode;
  /** Duración en ms antes de auto-descartar un toast. */
  duration?: number;
}

export function ToastProvider({ children, duration = 4000 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      counterRef.current += 1;
      const id = `toast-${counterRef.current}`;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => removeToast(id), duration);
    },
    [duration, removeToast]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        data-testid="toast-region"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-card border px-4 py-2 text-sm shadow-md',
              toneClasses[toast.tone]
            )}
            data-testid="toast"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
