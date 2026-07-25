import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TenantConfigResponse, WebhookStatusResponse } from '../../api/endpoints';
import { ReadinessChecklist } from './ReadinessChecklist';

function buildConfig(overrides: Partial<TenantConfigResponse> = {}): TenantConfigResponse {
  return {
    id: 'tenant-1',
    name: 'Inmobiliaria Test',
    slug: 'test',
    active: true,
    phoneNumberId: 'phone-1',
    wabaId: null,
    displayPhone: null,
    botName: 'Bot',
    botTone: '',
    schedulingLink: null,
    humanHours: null,
    competitorsToAvoid: [],
    coverageAreas: [],
    privacyNoticeSent: false,
    welcomeIntro: null,
    handoffIntro: null,
    alertPhone: null,
    alertsEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildWebhookStatus(overrides: Partial<WebhookStatusResponse> = {}): WebhookStatusResponse {
  return {
    connected: false,
    lastEventAt: null,
    lastMessageAt: null,
    ...overrides,
  };
}

describe('ReadinessChecklist', () => {
  it('marca todo sin cumplir cuando no hay propiedades, humanHours ni webhook conectado', () => {
    render(
      <ReadinessChecklist
        config={buildConfig()}
        propertiesCount={0}
        webhookStatus={buildWebhookStatus()}
      />,
    );

    expect(screen.getByTestId('readiness-item-properties-imported')).not.toHaveClass(
      'onboarding-checklist-item--checked',
    );
    expect(screen.getByTestId('readiness-item-human-hours')).not.toHaveClass(
      'onboarding-checklist-item--checked',
    );
    expect(screen.getByTestId('readiness-item-webhook-connected')).not.toHaveClass(
      'onboarding-checklist-item--checked',
    );
    // alertsEnabled es false, así que este ítem se considera cumplido (no aplica).
    expect(screen.getByTestId('readiness-item-alert-phone')).toHaveClass(
      'onboarding-checklist-item--checked',
    );
  });

  it('marca propiedades importadas cuando propertiesCount > 0', () => {
    render(
      <ReadinessChecklist
        config={buildConfig()}
        propertiesCount={5}
        webhookStatus={buildWebhookStatus()}
      />,
    );

    expect(screen.getByTestId('readiness-item-properties-imported')).toHaveClass(
      'onboarding-checklist-item--checked',
    );
  });

  it('exige alertPhone cuando alertsEnabled es true y no está cargado', () => {
    render(
      <ReadinessChecklist
        config={buildConfig({ alertsEnabled: true, alertPhone: null })}
        propertiesCount={1}
        webhookStatus={buildWebhookStatus()}
      />,
    );

    expect(screen.getByTestId('readiness-item-alert-phone')).not.toHaveClass(
      'onboarding-checklist-item--checked',
    );
  });

  it('marca alertPhone cumplido cuando alertsEnabled es true y el teléfono está cargado', () => {
    render(
      <ReadinessChecklist
        config={buildConfig({ alertsEnabled: true, alertPhone: '11-1111-1111' })}
        propertiesCount={1}
        webhookStatus={buildWebhookStatus()}
      />,
    );

    expect(screen.getByTestId('readiness-item-alert-phone')).toHaveClass(
      'onboarding-checklist-item--checked',
    );
  });

  it('marca humanHours cumplido cuando está cargado', () => {
    render(
      <ReadinessChecklist
        config={buildConfig({ humanHours: 'Lun a vie 9 a 18' })}
        propertiesCount={1}
        webhookStatus={buildWebhookStatus()}
      />,
    );

    expect(screen.getByTestId('readiness-item-human-hours')).toHaveClass(
      'onboarding-checklist-item--checked',
    );
  });

  it('marca webhook conectado cuando webhookStatus.connected es true', () => {
    render(
      <ReadinessChecklist
        config={buildConfig()}
        propertiesCount={1}
        webhookStatus={buildWebhookStatus({ connected: true })}
      />,
    );

    expect(screen.getByTestId('readiness-item-webhook-connected')).toHaveClass(
      'onboarding-checklist-item--checked',
    );
  });

  it('marca todo cumplido cuando todas las condiciones se satisfacen', () => {
    render(
      <ReadinessChecklist
        config={buildConfig({
          alertsEnabled: true,
          alertPhone: '11-1111-1111',
          humanHours: 'Lun a vie 9 a 18',
        })}
        propertiesCount={10}
        webhookStatus={buildWebhookStatus({ connected: true })}
      />,
    );

    for (const id of [
      'properties-imported',
      'alert-phone',
      'human-hours',
      'webhook-connected',
    ]) {
      expect(screen.getByTestId(`readiness-item-${id}`)).toHaveClass(
        'onboarding-checklist-item--checked',
      );
    }
  });
});
