/**
 * Wizard de onboarding de un tenant nuevo (orquestador, integra T12-T16).
 *
 * Estado 100% en memoria (`useState`/`useRef`): este wizard corre ANTES de
 * que exista una sesión persistida — el login real recién sucede cuando el
 * usuario entra a la app autenticado normalmente después (ver
 * `auth/session-store.ts`). Por eso acá nunca se llama a `setSession`: el
 * `sessionToken` que se obtiene en el paso 1 se guarda en un `useState` de
 * este componente y se pasa a mano a `CsvUploader`/`TenantConfigForm`/
 * `WebhookStatusCard` como `token`, pero nunca se persiste. Cuando el usuario
 * termina el wizard, entra a la app por el flujo normal de `LoginPage`.
 *
 * IMPORTANTE — master key: se tipea en un input propio de este componente
 * (no existe en ningún componente de T12-T16) y vive solo en `useState`. NO
 * se escribe en `sessionStorage`/`localStorage` en ningún punto del flujo.
 *
 * `ownerPassword` (que sale de `TenantCreateForm.onSuccess`) se necesita para
 * `bootstrapOwner` y para `login`, pero no tiene sentido dejarlo en el estado
 * del wizard más allá de eso: se guarda en un `useRef` (para poder reintentar
 * el bootstrap/login sin volver a pedírselo al usuario) y se descarta
 * (`= null`) apenas el login tiene éxito.
 *
 * Orquestación del paso 1, cada sub-paso reintentable de forma independiente:
 * 1. `TenantCreateForm` llama a `createTenant` internamente y devuelve
 *    `{ tenantId, apiKey, ownerEmail, ownerPassword }` vía `onSuccess`.
 * 2. Con el `tenantId` ya creado, este componente llama a `bootstrapOwner`.
 *    Si falla, botón "Reintentar" que vuelve a llamar SOLO a `bootstrapOwner`
 *    (nunca se vuelve a llamar `createTenant`).
 * 3. Si `bootstrapOwner` tiene éxito, se llama a `login`. Si falla, botón
 *    "Reintentar" que repite solo el login.
 * 4. Con sesión lista, se muestra `ApiKeyReveal` y el botón "Continuar".
 *
 * Paso 3: `ReadinessChecklist` necesita `config`/`propertiesCount`/
 * `webhookStatus`, pero ni `TenantConfigForm` ni `WebhookStatusCard` levantan
 * ese estado al padre por sí solos:
 * - `TenantConfigForm` sí expone `onSaved(config: TenantConfigResponse)`, así
 *   que `config` se llena la primera vez que el usuario guarda la
 *   configuración (antes de eso no mostramos el checklist: no hay config
 *   todavía, igual que no hay nada que "estar listo" sin haber guardado
 *   nada).
 * - `WebhookStatusCard` NO expone ningún callback: hace su propio fetch de
 *   `getWebhookStatus` internamente y no lo comparte. Para tener el dato acá
 *   arriba, este componente hace su propia llamada duplicada a
 *   `getWebhookStatus` (documentado: sí, es una llamada de más, pero es la
 *   única forma sin tocar el componente de T15).
 * - `propertiesCount` tampoco lo expone `CsvUploader` (no tiene callback de
 *   éxito): se resuelve con una llamada propia a `listProperties` al entrar
 *   al paso 3 (tipado real desde T9, `ListPropertiesResponse.total`).
 */

import { useEffect, useRef, useState } from 'react';
import {
  bootstrapOwner,
  getWebhookStatus,
  listProperties,
  login,
  type TenantConfigResponse,
  type WebhookStatusResponse,
} from '../api/endpoints';
import { WizardStepper } from '../components/onboarding/WizardStepper';
import { TenantCreateForm, type TenantCreateFormSuccess } from '../components/onboarding/TenantCreateForm';
import { ApiKeyReveal } from '../components/onboarding/ApiKeyReveal';
import { MetaSetupGuide } from '../components/onboarding/MetaSetupGuide';
import { CsvUploader } from '../components/onboarding/CsvUploader';
import { TenantConfigForm } from '../components/onboarding/TenantConfigForm';
import { ReadinessChecklist } from '../components/onboarding/ReadinessChecklist';
import { WebhookStatusCard } from '../components/onboarding/WebhookStatusCard';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { Button, Card, CardBody, CardHeader, Input } from '../components/ui';

type Step1Phase = 'form' | 'bootstrapping' | 'bootstrap-error' | 'logging-in' | 'login-error' | 'ready';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function OnboardingWizardPage(): JSX.Element {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [masterKey, setMasterKey] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

  // Solo se usa para poder reintentar bootstrap/login sin volver a pedirle la
  // contraseña al usuario. Se descarta (`= null`) apenas el login funciona.
  const ownerPasswordRef = useRef<string | null>(null);

  const [step1Phase, setStep1Phase] = useState<Step1Phase>('form');
  const [step1Error, setStep1Error] = useState<string | null>(null);

  const [config, setConfig] = useState<TenantConfigResponse | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatusResponse | null>(null);
  const [propertiesCount, setPropertiesCount] = useState(0);

  async function runBootstrap(tid: string, email: string): Promise<void> {
    setStep1Phase('bootstrapping');
    setStep1Error(null);
    try {
      await bootstrapOwner(tid, { email, password: ownerPasswordRef.current ?? '' }, masterKey);
      await runLogin(email);
    } catch (err) {
      setStep1Error(errorMessage(err, 'No se pudo crear el usuario owner.'));
      setStep1Phase('bootstrap-error');
    }
  }

  async function runLogin(email: string): Promise<void> {
    setStep1Phase('logging-in');
    setStep1Error(null);
    try {
      const result = await login(email, ownerPasswordRef.current ?? '');
      setSessionToken(result.token);
      ownerPasswordRef.current = null;
      setStep1Phase('ready');
    } catch (err) {
      setStep1Error(errorMessage(err, 'No se pudo iniciar sesión.'));
      setStep1Phase('login-error');
    }
  }

  function handleTenantCreated(result: TenantCreateFormSuccess): void {
    ownerPasswordRef.current = result.ownerPassword;
    setTenantId(result.tenantId);
    setApiKey(result.apiKey);
    setOwnerEmail(result.ownerEmail);
    void runBootstrap(result.tenantId, result.ownerEmail);
  }

  useEffect(() => {
    if (step !== 3 || !tenantId || !sessionToken) {
      return;
    }
    getWebhookStatus(tenantId, sessionToken)
      .then(setWebhookStatus)
      .catch(() => {});
    listProperties(tenantId, {}, sessionToken)
      .then((result) => setPropertiesCount(result.total))
      .catch(() => {});
  }, [step, tenantId, sessionToken]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div className="border-b border-border/80 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-text">Alta de Inmobiliaria</h1>
        <p className="text-xs text-text-muted mt-1">Configurá el sistema para tu agencia en 3 simples pasos</p>
      </div>

      <WizardStepper currentStep={step} />

      {step === 1 && (
        <div className="flex flex-col gap-4">
          {tenantId === null && (
            <Card className="onboarding-card">
              <CardHeader className="onboarding-card-header">
                <h2 className="onboarding-card-title">Master key</h2>
                <p className="onboarding-card-description">
                  Requerida para dar de alta el tenant y su usuario owner.
                </p>
              </CardHeader>
              <CardBody className="onboarding-card-body">
                <div className="onboarding-form-group">
                  <label htmlFor="wizard-master-key" className="onboarding-form-label onboarding-form-required">
                    Master key
                  </label>
                  <Input
                    id="wizard-master-key"
                    name="masterKey"
                    type="password"
                    autoComplete="off"
                    value={masterKey}
                    onChange={(e) => setMasterKey(e.target.value)}
                    required
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {tenantId === null && (
            <TenantCreateForm masterKey={masterKey} onSuccess={handleTenantCreated} />
          )}

          {tenantId !== null && step1Phase === 'bootstrapping' && (
            <Spinner text="Creando usuario owner..." />
          )}

          {tenantId !== null && step1Phase === 'logging-in' && (
            <Spinner text="Iniciando sesión..." />
          )}

          {tenantId !== null && step1Phase === 'bootstrap-error' && (
            <div className="flex flex-col gap-2">
              <ErrorBanner message={step1Error ?? 'No se pudo crear el usuario owner.'} />
              <Button
                type="button"
                onClick={() => {
                  if (tenantId && ownerEmail) {
                    void runBootstrap(tenantId, ownerEmail);
                  }
                }}
              >
                Reintentar
              </Button>
            </div>
          )}

          {tenantId !== null && step1Phase === 'login-error' && (
            <div className="flex flex-col gap-2">
              <ErrorBanner message={step1Error ?? 'No se pudo iniciar sesión.'} />
              <Button
                type="button"
                onClick={() => {
                  if (ownerEmail) {
                    void runLogin(ownerEmail);
                  }
                }}
              >
                Reintentar
              </Button>
            </div>
          )}

          {tenantId !== null && step1Phase === 'ready' && apiKey !== null && (
            <div className="flex flex-col gap-4">
              <ApiKeyReveal apiKey={apiKey} />
              <div>
                <Button type="button" onClick={() => setStep(2)}>
                  Continuar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && tenantId !== null && sessionToken !== null && (
        <div className="flex flex-col gap-4">
          <MetaSetupGuide />
          <CsvUploader tenantId={tenantId} token={sessionToken} />
          <div>
            <Button type="button" onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 3 && tenantId !== null && sessionToken !== null && (
        <div className="flex flex-col gap-4">
          <TenantConfigForm tenantId={tenantId} token={sessionToken} onSaved={setConfig} />
          <WebhookStatusCard tenantId={tenantId} token={sessionToken} />
          {config !== null && webhookStatus !== null && (
            <ReadinessChecklist
              config={config}
              propertiesCount={propertiesCount}
              webhookStatus={webhookStatus}
            />
          )}
        </div>
      )}
    </div>
  );
}
