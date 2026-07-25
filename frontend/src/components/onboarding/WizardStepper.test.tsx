import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WizardStepper } from './WizardStepper';

describe('WizardStepper', () => {
  it('marca el paso 1 como activo y los demás como pendientes', () => {
    render(<WizardStepper currentStep={1} />);

    expect(screen.getByTestId('wizard-step-1')).toHaveClass('onboarding-step--active');
    expect(screen.getByTestId('wizard-step-2')).not.toHaveClass('onboarding-step--active');
    expect(screen.getByTestId('wizard-step-2')).not.toHaveClass('onboarding-step--completed');
    expect(screen.getByTestId('wizard-step-3')).not.toHaveClass('onboarding-step--active');
    expect(screen.getByTestId('wizard-step-3')).not.toHaveClass('onboarding-step--completed');
  });

  it('marca el paso 2 como activo y el paso 1 como completado', () => {
    render(<WizardStepper currentStep={2} />);

    expect(screen.getByTestId('wizard-step-1')).toHaveClass('onboarding-step--completed');
    expect(screen.getByTestId('wizard-step-1')).not.toHaveClass('onboarding-step--active');
    expect(screen.getByTestId('wizard-step-2')).toHaveClass('onboarding-step--active');
    expect(screen.getByTestId('wizard-step-3')).not.toHaveClass('onboarding-step--active');
    expect(screen.getByTestId('wizard-step-3')).not.toHaveClass('onboarding-step--completed');
  });

  it('marca el paso 3 como activo y los pasos 1 y 2 como completados', () => {
    render(<WizardStepper currentStep={3} />);

    expect(screen.getByTestId('wizard-step-1')).toHaveClass('onboarding-step--completed');
    expect(screen.getByTestId('wizard-step-2')).toHaveClass('onboarding-step--completed');
    expect(screen.getByTestId('wizard-step-3')).toHaveClass('onboarding-step--active');
  });
});
