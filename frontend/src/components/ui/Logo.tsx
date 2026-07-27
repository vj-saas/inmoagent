import { cn } from '../../lib/cn';

/**
 * Isotipo propio: un techo a dos aguas con la esquina inferior derecha
 * recortada en punta, leyéndose a la vez como casa y como globo de
 * conversación (WhatsApp). Reemplaza el ícono genérico Building2 de
 * lucide-react usado antes en un cuadrado sin identidad propia.
 */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M16 7L25 15.5V24C25 24.552 24.552 25 24 25H19.5V18.5H14V25H9C8.448 25 8 24.552 8 24V19L16 7Z"
        className="fill-white"
      />
      <path d="M16 7L8 19V15.5L14.5 9.5C15.333 8.167 16.667 8.167 17.5 9.5L20 12.5L16 7Z" className="fill-accent" />
    </svg>
  );
}

export interface LogoProps {
  /** `mark` = solo isotipo (sidebar colapsado, favicon). `full` = isotipo + wordmark. */
  variant?: 'mark' | 'full';
  className?: string;
}

export function Logo({ variant = 'full', className }: LogoProps) {
  if (variant === 'mark') {
    return <Mark className={cn('h-8 w-8', className)} />;
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark className="h-8 w-8 shrink-0" />
      <span className="text-lg font-bold tracking-tight text-text">
        Inmo<span className="text-accent">Agent</span>
      </span>
    </span>
  );
}
