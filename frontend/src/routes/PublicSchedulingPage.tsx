import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicAppointmentDetails, getPublicAvailableSlots, confirmPublicAppointment, type PublicAppointmentDetails } from '../api/endpoints';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { Card, CardBody, CardHeader, Button } from '../components/ui';

export function PublicSchedulingPage(): JSX.Element {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  
  const [details, setDetails] = useState<PublicAppointmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    getPublicAppointmentDetails(appointmentId)
      .then((data) => {
        setDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Cita no encontrada o ya coordinada.');
        setLoading(false);
      });
  }, [appointmentId]);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    if (!appointmentId || !date) return;

    setLoadingSlots(true);
    getPublicAvailableSlots(appointmentId, date)
      .then((res) => {
        setSlots(res.slots);
        setLoadingSlots(false);
      })
      .catch(() => {
        setSlots([]);
        setLoadingSlots(false);
      });
  };

  const handleConfirm = () => {
    if (!appointmentId || !selectedDate || !selectedSlot) return;

    setConfirming(true);
    // Combina YYYY-MM-DD con HH:MM
    const scheduledAtStr = `${selectedDate}T${selectedSlot}:00`;
    confirmPublicAppointment(appointmentId, scheduledAtStr)
      .then(() => {
        setSuccess(true);
        setConfirming(false);
      })
      .catch((err) => {
        setError(err.message || 'Error al confirmar la cita.');
        setConfirming(false);
      });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner text="Cargando agenda de visita..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md">
          <ErrorBanner message={error} />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <Card className="w-full max-w-md border-2 border-border-strong shadow-[var(--shadow-hard)]">
          <CardBody className="flex flex-col items-center text-center p-8 space-y-4">
            <div className="flex h-16 w-16 items-center justify-center bg-success text-2xl font-bold text-white">
              ✓
            </div>
            <h1 className="u-display text-3xl text-text">¡Visita confirmada!</h1>
            <p className="text-sm text-text-muted">
              Reservamos tu turno de visita de forma exitosa. Un asesor de <strong className="text-text font-semibold">{details?.tenantName}</strong> se pondrá en contacto pronto si es necesario.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Genera días seleccionables (próximos 7 días hábiles/naturales a partir de hoy)
  const getNextDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 8; i++) {
      const next = new Date(today);
      next.setDate(today.getDate() + i);
      const yyyy = next.getFullYear();
      const mm = String(next.getMonth() + 1).padStart(2, '0');
      const dd = String(next.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };
      const label = next.toLocaleDateString('es-AR', options);
      days.push({ value: dateStr, label });
    }
    return days;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <Card className="w-full max-w-lg border-2 border-border-strong shadow-[var(--shadow-hard)]">
        <CardHeader className="border-b border-border/80 p-6">
          <p className="u-meta text-accent">Agendar Visita</p>
          <h1 className="u-display mt-2 text-2xl text-text">{details?.tenantName}</h1>
          <p className="text-xs text-text-muted mt-1">Hola {details?.leadName}, seleccioná tu horario para coordinar la visita a la propiedad.</p>
        </CardHeader>
        <CardBody className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="u-meta block text-text-muted">
              1. Seleccioná el día
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {getNextDays().map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => handleDateChange(day.value)}
                  className={`border p-3 text-center text-xs font-medium transition-colors duration-150 ${
                    selectedDate === day.value
                      ? 'border-accent-loud bg-accent-loud font-semibold text-on-accent'
                      : 'border-border bg-surface text-text hover:border-text-muted'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          {selectedDate && (
            <div className="space-y-2">
              <label className="u-meta block text-text-muted">
                2. Horarios disponibles
              </label>
              {loadingSlots ? (
                <div className="py-4 text-center">
                  <Spinner text="Buscando horarios..." />
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-text-muted bg-surface p-4 rounded-md border border-dashed border-border text-center">
                  No hay horarios disponibles para este día. Seleccioná otra fecha.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-md border p-2 text-center text-sm transition-all duration-200 ${
                        selectedSlot === slot
                          ? 'border-accent-loud bg-accent-loud font-semibold text-on-accent'
                          : 'border-border bg-surface text-text hover:border-text-muted'
                      }`}
                    >
                      {slot} hs
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedSlot && (
            <div className="pt-4 border-t border-border/60">
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full bg-accent hover:bg-accent-hover text-white h-11"
              >
                {confirming ? 'Confirmando...' : 'Confirmar Día y Horario'}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
