import { useEffect, useState } from 'react';
import { Input } from '../ui';

export interface DateRangePickerProps {
  /** Rango por defecto (formato `YYYY-MM-DD`, calculado por el padre). */
  initialFrom: string;
  initialTo: string;
  /**
   * Emitido solo cuando `fromDay <= toDay`, con ambos extremos normalizados
   * a ISO string (inicio/fin de día en hora local).
   */
  onChange: (range: { from: string; to: string }) => void;
  /**
   * Se invoca en cada cambio con `true`/`false` según `fromDay <= toDay`,
   * para que el padre pueda mostrar el mensaje de validación (AC-4) sin leer
   * el DOM. `onChange` solo dispara cuando el rango es válido; este callback
   * es la única vía por la que el padre se entera del estado inválido.
   */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * Selector de rango de fechas (`from`/`to`) con dos `<input type="date">`.
 *
 * - Mantiene el estado interno en `YYYY-MM-DD` (formato nativo del input).
 * - Valida que ambas fechas estén bien formadas (`YYYY-MM-DD`, un input
 *   vacío o a medio tipear no lo está) y que `fromDay <= toDay` (orden
 *   lexicográfico, válido para YYYY-MM-DD) ANTES de emitir. Si algo de eso
 *   falla, NO invoca `onChange` y en cambio notifica `onValidityChange(false)`
 *   para que el padre (`DashboardPage`) pinte el mensaje de validación en
 *   español, sin depender de leer el DOM.
 * - Al emitir un rango válido, normaliza: `from` → 00:00:00.000 local del
 *   día elegido, `to` → 23:59:59.999 local del día elegido, ambos vía
 *   `.toISOString()` (rango inclusivo del día completo).
 */
export function DateRangePicker({
  initialFrom,
  initialTo,
  onChange,
  onValidityChange,
}: DateRangePickerProps): JSX.Element {
  const [fromDay, setFromDay] = useState(initialFrom);
  const [toDay, setToDay] = useState(initialTo);

  // Un input type="date" puede quedar en "" (o un valor parcial) mientras el
  // usuario lo borra o lo está tipeando: tratarlo como rango inválido en vez
  // de intentar parsearlo evita un crash de `toISOString()` sobre una fecha
  // inválida (Invalid Date).
  const isWellFormed = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day);
  const isValid = isWellFormed(fromDay) && isWellFormed(toDay) && fromDay <= toDay;

  useEffect(() => {
    onValidityChange?.(isValid);
    if (!isValid) {
      return;
    }
    const from = startOfDayLocal(fromDay).toISOString();
    const to = endOfDayLocal(toDay).toISOString();
    onChange({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDay, toDay]);

  return (
    <div
      className="flex flex-wrap items-end gap-3"
      data-testid="date-range-picker"
      data-valid={isValid}
    >
      <label htmlFor="date-range-from" className="u-meta flex flex-col gap-1.5 text-text-muted">
        Desde
        <Input
          id="date-range-from"
          type="date"
          value={fromDay}
          onChange={(e) => setFromDay(e.target.value)}
          data-testid="date-range-from"
          className="w-auto"
        />
      </label>
      <label htmlFor="date-range-to" className="u-meta flex flex-col gap-1.5 text-text-muted">
        Hasta
        <Input
          id="date-range-to"
          type="date"
          value={toDay}
          onChange={(e) => setToDay(e.target.value)}
          data-testid="date-range-to"
          className="w-auto"
        />
      </label>
    </div>
  );
}

function startOfDayLocal(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 0, 0, 0, 0);
}

function endOfDayLocal(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 23, 59, 59, 999);
}
