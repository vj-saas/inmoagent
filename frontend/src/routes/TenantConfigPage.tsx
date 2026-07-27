/**
 * Configuración del tenant, posterior al onboarding (para cuando un OWNER ya
 * tiene el tenant funcionando y quiere ajustar textos/alertas).
 *
 * Reusa `TenantConfigForm` (T14) y `WebhookStatusCard` (T15) tal cual, sin
 * duplicar su lógica interna.
 *
 * LIMITACIÓN DOCUMENTADA — sin GET de config: el backend
 * (`AdminTenantsController`, `src/admin/tenants/admin-tenants.controller.ts`)
 * solo expone `PATCH :tenantId/config` y `GET :tenantId/webhook-status`; no
 * hay un endpoint de lectura dedicado para la config actual del tenant. Por
 * eso esta página NO pasa `initialConfig` a `TenantConfigForm`: el form
 * arranca vacío (placeholders/valores en blanco) y se autocompleta recién
 * después del primer `onSaved` exitoso, igual que en `OnboardingWizardPage`
 * (T17). No bloqueamos la tarea por esto — si en el futuro se agrega un GET
 * de config, alcanza con reemplazar el `useState` de `savedConfig` de acá por
 * un fetch inicial real.
 *
 * Restricción por rol: igual que `PeoplePage`, la visibilidad se resuelve
 * ocultando el link de navegación a no-OWNER en `AppLayout` (ver
 * `person?.role === 'OWNER'` ahí). Esta página no agrega un guard de rol
 * propio: si un AGENT navega directo a la URL, el submit del formulario va a
 * fallar con 403 (el backend protege `PATCH .../config` con
 * `OwnerRoleGuard`) y `TenantConfigForm` ya muestra ese error con
 * `ErrorBanner` dentro del propio formulario.
 */

import { useState } from 'react';
import { type TenantConfigResponse } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { TenantConfigForm } from '../components/onboarding/TenantConfigForm';
import { WebhookStatusCard } from '../components/onboarding/WebhookStatusCard';

export function TenantConfigPage(): JSX.Element {
  const { person, token } = useAuth();
  const tenantId = person?.tenantId ?? '';

  const [savedConfig, setSavedConfig] = useState<TenantConfigResponse | null>(null);

  return (
    <div>
      <div className="mb-6 border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text">Configuración</h1>
        <p className="mt-1 text-xs text-text-muted">
          Datos del tenant, credenciales de Meta y estado del webhook.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <TenantConfigForm
          tenantId={tenantId}
          token={token ?? ''}
          initialConfig={savedConfig ?? undefined}
          onSaved={setSavedConfig}
        />
        <WebhookStatusCard tenantId={tenantId} token={token ?? ''} />
      </div>
    </div>
  );
}
