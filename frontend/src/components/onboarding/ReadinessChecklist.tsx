/**
 * Checklist de "listo para lanzar" del paso 3 del wizard de onboarding.
 *
 * Puramente presentacional/derivado: no hace llamadas propias al backend,
 * solo calcula ítems booleanos a partir de las props ya cargadas por el
 * componente padre (`config`, `propertiesCount`, `webhookStatus`).
 *
 * Decisión sobre alertas (documentada acá porque no está en la spec):
 * si `config.alertsEnabled` es `false`, el usuario explícitamente no quiere
 * alertas, así que no tiene sentido bloquear el checklist pidiendo un
 * teléfono que no se va a usar — el ítem se muestra cumplido en ese caso.
 * Si `alertsEnabled` es `true`, el ítem exige `alertPhone` cargado.
 */

import type { TenantConfigResponse, WebhookStatusResponse } from '../../api/endpoints';

export interface ReadinessChecklistProps {
  config: TenantConfigResponse;
  propertiesCount: number;
  webhookStatus: WebhookStatusResponse;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  checked: boolean;
}

function hasValue(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function buildItems(props: ReadinessChecklistProps): ChecklistItem[] {
  const { config, propertiesCount, webhookStatus } = props;

  return [
    {
      id: 'properties-imported',
      title: 'Propiedades importadas',
      description: 'Al menos una propiedad cargada para que el bot pueda ofrecer opciones.',
      checked: propertiesCount > 0,
    },
    {
      id: 'alert-phone',
      title: 'Teléfono de alertas configurado',
      description: config.alertsEnabled
        ? 'Las alertas están habilitadas: hace falta un teléfono para recibirlas.'
        : 'Las alertas están deshabilitadas, no hace falta teléfono.',
      // Si las alertas están apagadas, este ítem no aplica y se muestra cumplido.
      checked: config.alertsEnabled ? hasValue(config.alertPhone) : true,
    },
    {
      id: 'human-hours',
      title: 'Horario de atención humana',
      description: 'Se muestra al lead cuando el bot lo deriva a un asesor.',
      checked: hasValue(config.humanHours),
    },
    {
      id: 'webhook-connected',
      title: 'Webhook conectado',
      description: 'Ya vimos tráfico entrante real desde WhatsApp en este número.',
      checked: webhookStatus.connected === true,
    },
  ];
}

export function ReadinessChecklist(props: ReadinessChecklistProps): JSX.Element {
  const items = buildItems(props);

  return (
    <ul className="onboarding-checklist" data-testid="readiness-checklist">
      {items.map((item) => {
        const stateClass = item.checked ? 'onboarding-checklist-item--checked' : '';
        return (
          <li
            key={item.id}
            className={`onboarding-checklist-item ${stateClass}`.trim()}
            data-testid={`readiness-item-${item.id}`}
          >
            <input
              type="checkbox"
              checked={item.checked}
              readOnly
              aria-label={item.title}
              className="onboarding-checklist-item-checkbox"
            />
            <div className="onboarding-checklist-item-content">
              <p className="onboarding-checklist-item-title">{item.title}</p>
              <p className="onboarding-checklist-item-description">{item.description}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
