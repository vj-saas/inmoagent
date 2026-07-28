import { cn } from '../../lib/cn';

/**
 * Isotipo: un sello impreso, no un ícono.
 *
 * Cuadrado macizo de tinta con esquina viva, un vano a dos aguas recortado en
 * el papel (la casa) y la cola del globo de conversación resuelta como un
 * bloque de acento en la esquina inferior izquierda (WhatsApp). Se construye
 * por sustracción de bloques, igual que el resto del sistema: sin degradados,
 * sin esquinas redondeadas, sin sombra.
 *
 * Usa `fill-primary` / `fill-on-invert`, así que se invierte solo en modo
 * oscuro (sello de papel sobre tinta) sin duplicar el SVG.
 */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" className="fill-primary" />
      {/* Vano a dos aguas: el hueco de papel dentro del sello. */}
      <path d="M16 6.5L26.5 17H22.5V25.5H9.5V17H5.5L16 6.5Z" className="fill-on-invert" />
      {/* Cola del globo: el bloque de acento que lo vuelve conversación. */}
      <path d="M5.5 32V25.5H12L5.5 32Z" className="fill-accent-loud" />
    </svg>
  );
}

export interface LogoProps {
  /** `mark` = solo el sello (rail colapsado, header mobile, favicon). */
  variant?: 'mark' | 'full';
  className?: string;
}

export function Logo({ variant = 'full', className }: LogoProps) {
  if (variant === 'mark') {
    return <Mark className={cn('h-8 w-8 shrink-0', className)} />;
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark className="h-8 w-8 shrink-0" />
      <span className="u-display text-xl text-text">
        Inmo<span className="text-accent">Agent</span>
      </span>
    </span>
  );
}
