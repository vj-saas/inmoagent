import {
  forwardRef,
  useEffect,
  useRef,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}

/**
 * `role="dialog" aria-modal="true"`, cierre con Escape y click afuera, foco
 * inicial al primer control. Sin portal ni elemento `<dialog>` nativo (jsdom
 * no lo soporta).
 */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ open, onClose, title, children, className, ...props }, ref) => {
    const dialogRef = useRef<HTMLDivElement | null>(null);

    const setDialogRef = (node: HTMLDivElement | null) => {
      dialogRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as MutableRefObject<HTMLDivElement | null>).current = node;
      }
    };

    useEffect(() => {
      if (!open) return undefined;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    useEffect(() => {
      if (!open) return;
      const node = dialogRef.current;
      const focusable = node?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      focusable?.focus();
    }, [open]);

    if (!open) return null;

    const handleOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
        onClick={handleOverlayClick}
        data-testid="modal-overlay"
      >
        {/*
          La única "sombra" del sistema: dura, sin blur y desplazada
          (`shadow-[var(--shadow-hard)]`). No simula elevación física — marca
          que el bloque está impreso encima del resto.
        */}
        <div
          ref={setDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
          className={cn(
            'flex max-h-[90vh] w-full max-w-md flex-col border-2 border-border-strong bg-surface shadow-[var(--shadow-hard)]',
            className,
          )}
          {...props}
        >
          {title && (
            <div className="u-meta shrink-0 border-b-2 border-border-strong px-4 py-3 text-text">
              {title}
            </div>
          )}
          <div className="overflow-y-auto p-4">{children}</div>
        </div>
      </div>
    );
  }
);
Modal.displayName = 'Modal';
