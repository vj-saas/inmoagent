/**
 * Formulario del paso 1 del wizard de onboarding: alta de tenant.
 *
 * - Llama a `endpoints.createTenant(dto, masterKey)`. NO llama a
 *   `bootstrapOwner`: eso lo orquesta el componente padre
 *   (`OnboardingWizardPage`, T17), que recibe vía `onSuccess` el
 *   `tenantId`/`apiKey` recién creados más el email/contraseña del owner
 *   que el usuario tipeó acá (campos que no forman parte de
 *   `CreateTenantRequest`).
 * - `ConflictError` (slug o phoneNumberId duplicados) se mapea a un error de
 *   campo específico buscando substrings ("slug"/"phoneNumberId") en
 *   `err.message` — el backend no distingue el conflicto con un código
 *   propio, así que si el mensaje no permite diferenciar mostramos el error
 *   como error general del formulario (documentado en `mapConflictError`).
 */

import { useState } from 'react';
import { createTenant, type CreateTenantRequest } from '../../api/endpoints';
import { ConflictError } from '../../api/http-client';
import { ErrorBanner } from '../ErrorBanner';
import { Button, Card, CardBody, CardHeader, Input } from '../ui';

export interface TenantCreateFormSuccess {
  tenantId: string;
  apiKey: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface TenantCreateFormProps {
  masterKey: string;
  onSuccess: (result: TenantCreateFormSuccess) => void;
}

interface FieldErrors {
  slug?: string;
  phoneNumberId?: string;
}

/**
 * El backend no expone un código de error diferenciado por columna
 * conflictiva: solo tenemos el `message` de texto. Buscamos substrings
 * conocidos; si no matchea ninguno, devolvemos `null` (error general).
 */
function mapConflictError(message: string): FieldErrors | null {
  const lower = message.toLowerCase();
  if (lower.includes('slug')) {
    return { slug: message };
  }
  if (lower.includes('phonenumberid') || lower.includes('phone number')) {
    return { phoneNumberId: message };
  }
  return null;
}

function splitList(value: string): string[] | undefined {
  const items = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

export function TenantCreateForm({ masterKey, onSuccess }: TenantCreateFormProps): JSX.Element {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [botName, setBotName] = useState('');
  const [botTone, setBotTone] = useState('');
  const [humanHours, setHumanHours] = useState('');
  const [schedulingLink, setSchedulingLink] = useState('');
  const [alertPhone, setAlertPhone] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [coverageAreas, setCoverageAreas] = useState('');
  const [competitorsToAvoid, setCompetitorsToAvoid] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const dto: CreateTenantRequest = {
      name,
      slug,
      phoneNumberId,
      accessToken,
      wabaId: wabaId || undefined,
      displayPhone: displayPhone || undefined,
      botName: botName || undefined,
      botTone: botTone || undefined,
      humanHours: humanHours || undefined,
      schedulingLink: schedulingLink || undefined,
      alertPhone: alertPhone || undefined,
      alertsEnabled,
      coverageAreas: splitList(coverageAreas),
      competitorsToAvoid: splitList(competitorsToAvoid),
    };

    try {
      const created = await createTenant(dto, masterKey);
      onSuccess({
        tenantId: created.tenantId,
        apiKey: created.apiKey,
        ownerEmail,
        ownerPassword,
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        const mapped = mapConflictError(err.message);
        if (mapped) {
          setFieldErrors(mapped);
        } else {
          setFormError(err.message);
        }
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('No se pudo crear el tenant.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="onboarding-card">
      <CardHeader className="onboarding-card-header">
        <h2 className="onboarding-card-title">Datos del tenant</h2>
        <p className="onboarding-card-description">
          Completá los datos de la inmobiliaria y de la conexión con WhatsApp.
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
              <label htmlFor="tenant-name" className="onboarding-form-label onboarding-form-required">
                Nombre
              </label>
              <Input
                id="tenant-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-slug" className="onboarding-form-label onboarding-form-required">
                Slug
              </label>
              <Input
                id="tenant-slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={submitting}
                invalid={Boolean(fieldErrors.slug)}
                required
              />
              {fieldErrors.slug && <p className="onboarding-form-error">{fieldErrors.slug}</p>}
            </div>

            <div className="onboarding-form-group">
              <label
                htmlFor="tenant-phone-number-id"
                className="onboarding-form-label onboarding-form-required"
              >
                Phone Number ID
              </label>
              <Input
                id="tenant-phone-number-id"
                name="phoneNumberId"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                disabled={submitting}
                invalid={Boolean(fieldErrors.phoneNumberId)}
                required
              />
              {fieldErrors.phoneNumberId && (
                <p className="onboarding-form-error">{fieldErrors.phoneNumberId}</p>
              )}
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-waba-id" className="onboarding-form-label">
                WABA ID
              </label>
              <Input
                id="tenant-waba-id"
                name="wabaId"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-access-token" className="onboarding-form-label onboarding-form-required">
                Access token
              </label>
              <Input
                id="tenant-access-token"
                name="accessToken"
                type="password"
                autoComplete="new-password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-display-phone" className="onboarding-form-label">
                Teléfono a mostrar
              </label>
              <Input
                id="tenant-display-phone"
                name="displayPhone"
                value={displayPhone}
                onChange={(e) => setDisplayPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="onboarding-form-section">
            <div className="onboarding-form-group">
              <label htmlFor="tenant-bot-name" className="onboarding-form-label">
                Nombre del bot
              </label>
              <Input
                id="tenant-bot-name"
                name="botName"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-bot-tone" className="onboarding-form-label">
                Tono del bot
              </label>
              <Input
                id="tenant-bot-tone"
                name="botTone"
                value={botTone}
                onChange={(e) => setBotTone(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-human-hours" className="onboarding-form-label">
                Horario de atención humana
              </label>
              <Input
                id="tenant-human-hours"
                name="humanHours"
                value={humanHours}
                onChange={(e) => setHumanHours(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-scheduling-link" className="onboarding-form-label">
                Link de agenda
              </label>
              <Input
                id="tenant-scheduling-link"
                name="schedulingLink"
                value={schedulingLink}
                onChange={(e) => setSchedulingLink(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-alert-phone" className="onboarding-form-label">
                Teléfono de alertas
              </label>
              <Input
                id="tenant-alert-phone"
                name="alertPhone"
                value={alertPhone}
                onChange={(e) => setAlertPhone(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-alerts-enabled" className="onboarding-form-label">
                <input
                  id="tenant-alerts-enabled"
                  name="alertsEnabled"
                  type="checkbox"
                  checked={alertsEnabled}
                  onChange={(e) => setAlertsEnabled(e.target.checked)}
                  disabled={submitting}
                  className="mr-2"
                />
                Alertas habilitadas
              </label>
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-coverage-areas" className="onboarding-form-label">
                Zonas de cobertura
              </label>
              <textarea
                id="tenant-coverage-areas"
                name="coverageAreas"
                value={coverageAreas}
                onChange={(e) => setCoverageAreas(e.target.value)}
                disabled={submitting}
                className="h-20 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="onboarding-form-helper">Separadas por coma o salto de línea.</p>
            </div>

            <div className="onboarding-form-group">
              <label htmlFor="tenant-competitors-to-avoid" className="onboarding-form-label">
                Competidores a evitar
              </label>
              <textarea
                id="tenant-competitors-to-avoid"
                name="competitorsToAvoid"
                value={competitorsToAvoid}
                onChange={(e) => setCompetitorsToAvoid(e.target.value)}
                disabled={submitting}
                className="h-20 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="onboarding-form-helper">Separados por coma o salto de línea.</p>
            </div>
          </div>

          <div className="onboarding-form-section">
            <div className="onboarding-form-group">
              <label htmlFor="tenant-owner-email" className="onboarding-form-label onboarding-form-required">
                Email del owner
              </label>
              <Input
                id="tenant-owner-email"
                name="ownerEmail"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div className="onboarding-form-group">
              <label
                htmlFor="tenant-owner-password"
                className="onboarding-form-label onboarding-form-required"
              >
                Contraseña del owner
              </label>
              <Input
                id="tenant-owner-password"
                name="ownerPassword"
                type="password"
                autoComplete="new-password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div>
            <Button type="submit" disabled={submitting} loading={submitting}>
              Crear tenant
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
