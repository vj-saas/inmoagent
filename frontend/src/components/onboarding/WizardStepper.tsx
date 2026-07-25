/**
 * Indicador visual de paso del wizard de onboarding (1/2/3).
 *
 * Puramente presentacional: no conoce estado del wizard, solo recibe el paso
 * actual. Usa las clases `onboarding-stepper*` ya definidas en `index.css`.
 */

export interface WizardStepperProps {
  currentStep: 1 | 2 | 3;
}

const STEPS: { step: 1 | 2 | 3; label: string }[] = [
  { step: 1, label: 'Datos del tenant' },
  { step: 2, label: 'Conexión con Meta' },
  { step: 3, label: 'Configuración final' },
];

export function WizardStepper({ currentStep }: WizardStepperProps): JSX.Element {
  return (
    <ol className="onboarding-stepper" data-testid="wizard-stepper">
      {STEPS.map(({ step, label }) => {
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        const stateClass = isActive
          ? 'onboarding-step--active'
          : isCompleted
            ? 'onboarding-step--completed'
            : '';

        return (
          <li
            key={step}
            className={`onboarding-step ${stateClass}`.trim()}
            data-testid={`wizard-step-${step}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="onboarding-step-circle">{step}</span>
            <span className="onboarding-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
