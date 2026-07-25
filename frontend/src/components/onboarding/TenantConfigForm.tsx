/**
 * Formulario de configuración del tenant, reusado por el paso 3 del wizard
 * de onboarding (`OnboardingWizardPage`, T17) y por `TenantConfigPage` (T18,
 * edición posterior). Componente puro: no sabe si está dentro del wizard o
 * de la página de configuración, solo necesita `tenantId`/`token`.
 *
 * PATCH PARCIAL REAL: se lleva un `Set` de nombres de campo tocados
 * (`touched`). Al enviar, el dto que se manda a `updateTenantConfig` solo
 * incluye esas claves — nunca los 11 campos del form, aunque estén vacíos o
 * sin cambios. Si un campo tocado queda vacío (string vacío tras trim),
 * igual se envía como `''`: el backend interpreta string vacío como "borrar
 * campo" (ver `TenantsAdminService.updateConfig`), así que acá NO se
 * convierte vacío a `undefined` para campos tocados.
 *
 * La vista previa de los mensajes finales (saludo/handoff) es aproximada:
 * replica la forma del texto real de `src/conversation/templates.ts`
 * (`buildGreetingMessage`/`buildHandoffFarewell`) pero no tiene que ser
 * carácter-por-carácter idéntica — esa exactitud la garantiza el backend
 * (guardrail ya testeado en `templates.spec.ts`), acá solo mostramos una
 * idea de cómo va a quedar.
 */

import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  updateTenantConfig,
  type TenantConfigResponse,
  type UpdateTenantConfigRequest,
} from '../../api/endpoints';
import { ErrorBanner } from '../ErrorBanner';
import { Button, Card, CardBody, CardHeader, Input } from '../ui';

export interface TenantConfigFormProps {
  tenantId: string;
  token: string;
  initialConfig?: Partial<TenantConfigResponse>;
  onSaved?: (config: TenantConfigResponse) => void;
}

const WELCOME_INTRO_MAX = 500;
const HANDOFF_INTRO_MAX = 300;

// Textos aproximados de los tramos que el backend agrega siempre — calcados
// de `src/conversation/templates.ts` (OPERATION_QUESTION / buildPrivacyLine)
// para que la vista previa tenga la misma forma, sin pretender ser exacta.
const OPERATION_QUESTION_PREVIEW = 'Contame, ¿estás buscando *comprar* o *alquilar*?';

interface FormState {
  alertPhone: string;
  alertsEnabled: boolean;
  humanHours: string;
  botName: string;
  botTone: string;
  schedulingLink: string;
  coverageAreas: string;
  competitorsToAvoid: string;
  displayPhone: string;
  welcomeIntro: string;
  handoffIntro: string;
}

type FieldName = keyof FormState;

function toRawState(config?: Partial<TenantConfigResponse>): FormState {
  return {
    alertPhone: config?.alertPhone ?? '',
    alertsEnabled: config?.alertsEnabled ?? false,
    humanHours: config?.humanHours ?? '',
    botName: config?.botName ?? '',
    botTone: config?.botTone ?? '',
    schedulingLink: config?.schedulingLink ?? '',
    coverageAreas: (config?.coverageAreas ?? []).join(', '),
    competitorsToAvoid: (config?.competitorsToAvoid ?? []).join(', '),
    displayPhone: config?.displayPhone ?? '',
    welcomeIntro: config?.welcomeIntro ?? '',
    handoffIntro: config?.handoffIntro ?? '',
  };
}

function splitToArray(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function privacyLinePreview(tenantName: string): string {
  return `Al continuar aceptás que ${tenantName} use tus datos solo para gestionar tu consulta (Ley 25.326). Escribí BAJA cuando quieras dejar de recibir mensajes.`;
}

export function TenantConfigForm({
  tenantId,
  token,
  initialConfig,
  onSaved,
}: TenantConfigFormProps): JSX.Element {
  const [baseline, setBaseline] = useState<Partial<TenantConfigResponse> | undefined>(
    initialConfig
  );
  const [values, setValues] = useState<FormState>(() => toRawState(initialConfig));
  const [touched, setTouched] = useState<Set<FieldName>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const markTouched = (field: FieldName): void => {
    setTouched((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };

  const handleTextChange =
    (field: FieldName) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      const { value } = event.target;
      setValues((prev) => ({ ...prev, [field]: value }));
      markTouched(field);
    };

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const { checked } = event.target;
    setValues((prev) => ({ ...prev, alertsEnabled: checked }));
    markTouched('alertsEnabled');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const dto: UpdateTenantConfigRequest = {};
    for (const field of touched) {
      switch (field) {
        case 'alertsEnabled':
          dto.alertsEnabled = values.alertsEnabled;
          break;
        case 'coverageAreas':
          dto.coverageAreas = splitToArray(values.coverageAreas);
          break;
        case 'competitorsToAvoid':
          dto.competitorsToAvoid = splitToArray(values.competitorsToAvoid);
          break;
        default:
          dto[field] = values[field].trim();
          break;
      }
    }

    try {
      const updated = await updateTenantConfig(tenantId, dto, token);
      setBaseline(updated);
      setValues(toRawState(updated));
      setTouched(new Set());
      onSaved?.(updated);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      setSubmitting(false);
    }
  };

  const tenantName = baseline?.name ?? 'la inmobiliaria';
  const botDisplayName = values.botName.trim() || 'nuestro asistente';
  const defaultWelcomeIntro = `¡Hola! 👋 Soy ${botDisplayName}, de ${tenantName}. Estoy para ayudarte a encontrar tu próxima propiedad, a cualquier hora.`;
  const greetingPreview = [
    values.welcomeIntro.trim() || defaultWelcomeIntro,
    OPERATION_QUESTION_PREVIEW,
    privacyLinePreview(tenantName),
  ].join('\n\n');

  const defaultHandoffIntro = `¡Claro! Te dejo con un asesor de ${tenantName}, te escribe a la brevedad.`;
  const hoursLine = values.humanHours.trim()
    ? ` Horario de atención: ${values.humanHours.trim()}.`
    : '';
  const handoffPreview = `${values.handoffIntro.trim() || defaultHandoffIntro}${hoursLine}`;

  return (
    <Card className="onboarding-card">
      <CardHeader className="onboarding-card-header">
        <h2 className="onboarding-card-title">Configuración final</h2>
        <p className="onboarding-card-description">
          Estos textos se usan para redactar los mensajes automáticos del bot.
        </p>
      </CardHeader>
      <CardBody className="onboarding-card-body">
        {formError && (
          <div className="mb-4">
            <ErrorBanner message={formError} />
          </div>
        )}
        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="onboarding-form-section">
            <div className="onboarding-form-group">
              <label htmlFor="config-bot-name" className="onboarding-form-label">
                Nombre del bot
              </label>
              <Input
                id="config-bot-name"
                name="botName"
                value={values.botName}
                onChange={handleTextChange('botName')}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-bot-tone" className="onboarding-form-label">
                Tono del bot
              </label>
              <Input
                id="config-bot-tone"
                name="botTone"
                value={values.botTone}
                onChange={handleTextChange('botTone')}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-display-phone" className="onboarding-form-label">
                Teléfono a mostrar
              </label>
              <Input
                id="config-display-phone"
                name="displayPhone"
                value={values.displayPhone}
                onChange={handleTextChange('displayPhone')}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-scheduling-link" className="onboarding-form-label">
                Link de agenda
              </label>
              <Input
                id="config-scheduling-link"
                name="schedulingLink"
                value={values.schedulingLink}
                onChange={handleTextChange('schedulingLink')}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-human-hours" className="onboarding-form-label">
                Horario de atención humana
              </label>
              <Input
                id="config-human-hours"
                name="humanHours"
                value={values.humanHours}
                onChange={handleTextChange('humanHours')}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-coverage-areas" className="onboarding-form-label">
                Zonas de cobertura
              </label>
              <textarea
                id="config-coverage-areas"
                name="coverageAreas"
                value={values.coverageAreas}
                onChange={handleTextChange('coverageAreas')}
                disabled={submitting}
                className="h-20 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="onboarding-form-helper">Separadas por coma o salto de línea.</p>
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-competitors-to-avoid" className="onboarding-form-label">
                Competidores a evitar
              </label>
              <textarea
                id="config-competitors-to-avoid"
                name="competitorsToAvoid"
                value={values.competitorsToAvoid}
                onChange={handleTextChange('competitorsToAvoid')}
                disabled={submitting}
                className="h-20 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="onboarding-form-helper">Separados por coma o salto de línea.</p>
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-alert-phone" className="onboarding-form-label">
                Teléfono de alertas
              </label>
              <Input
                id="config-alert-phone"
                name="alertPhone"
                value={values.alertPhone}
                onChange={handleTextChange('alertPhone')}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-alerts-enabled" className="onboarding-form-label">
                <input
                  id="config-alerts-enabled"
                  name="alertsEnabled"
                  type="checkbox"
                  checked={values.alertsEnabled}
                  onChange={handleCheckboxChange}
                  disabled={submitting}
                  className="mr-2"
                />
                Alertas habilitadas
              </label>
            </div>
          </div>

          <div className="onboarding-form-section">
            <div className="onboarding-form-group">
              <label htmlFor="config-welcome-intro" className="onboarding-form-label">
                Mensaje de bienvenida (intro)
              </label>
              <textarea
                id="config-welcome-intro"
                name="welcomeIntro"
                value={values.welcomeIntro}
                onChange={handleTextChange('welcomeIntro')}
                disabled={submitting}
                maxLength={WELCOME_INTRO_MAX}
                className="h-24 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="onboarding-form-helper">
                {values.welcomeIntro.length}/{WELCOME_INTRO_MAX} — si lo dejás vacío se usa un
                saludo por defecto.
              </p>
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="config-handoff-intro" className="onboarding-form-label">
                Mensaje de derivación a humano (intro)
              </label>
              <textarea
                id="config-handoff-intro"
                name="handoffIntro"
                value={values.handoffIntro}
                onChange={handleTextChange('handoffIntro')}
                disabled={submitting}
                maxLength={HANDOFF_INTRO_MAX}
                className="h-20 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="onboarding-form-helper">
                {values.handoffIntro.length}/{HANDOFF_INTRO_MAX} — si lo dejás vacío se usa una
                frase por defecto.
              </p>
            </div>

            <p className="onboarding-form-helper">
              La pregunta de operación y el aviso de tratamiento de datos (Ley 25.326) se agregan
              siempre automáticamente al saludo, igual que el horario de atención al mensaje de
              derivación — no se pueden quitar ni editar acá.
            </p>
          </div>

          <div className="onboarding-form-section" data-testid="config-preview">
            <div className="onboarding-form-group">
              <span className="onboarding-form-label">
                Vista previa aproximada del saludo
              </span>
              <p className="onboarding-form-helper">
                Vista previa aproximada — el aviso legal se agrega siempre automáticamente y no se
                puede quitar.
              </p>
              <p data-testid="greeting-preview" className="whitespace-pre-line text-sm text-text">
                {greetingPreview}
              </p>
            </div>

            <div className="onboarding-form-group">
              <span className="onboarding-form-label">
                Vista previa aproximada de la derivación a humano
              </span>
              <p data-testid="handoff-preview" className="whitespace-pre-line text-sm text-text">
                {handoffPreview}
              </p>
            </div>
          </div>

          <div>
            <Button type="submit" disabled={submitting} loading={submitting}>
              Guardar configuración
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
