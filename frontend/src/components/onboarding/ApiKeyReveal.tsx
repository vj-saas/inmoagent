/**
 * Muestra la API key generada tras crear el tenant (`CreatedTenant.apiKey`).
 *
 * Advertencia visible: la key no se vuelve a mostrar, hay que guardarla
 * ahora. Toggle mostrar/ocultar + botón de copiar (patrón `handleCopy`/
 * `copied` de `PeoplePage.tsx`).
 */

import { useState } from 'react';
import { Button } from '../ui';

export interface ApiKeyRevealProps {
  apiKey: string;
}

export function ApiKeyReveal({ apiKey }: ApiKeyRevealProps): JSX.Element {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleToggleVisible = (): void => {
    setVisible((prev) => !prev);
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      // Sin clipboard disponible, no hacemos nada más: el usuario puede
      // seleccionar el texto manualmente.
    }
  };

  return (
    <div className="onboarding-api-key-reveal" data-testid="api-key-reveal">
      <p className="onboarding-form-error">
        Esta API key no se vuelve a mostrar: guardala ahora en un lugar seguro.
      </p>
      <div className="onboarding-api-key-reveal-container">
        <input
          type={visible ? 'text' : 'password'}
          value={apiKey}
          readOnly
          aria-label="API key"
          className={`onboarding-api-key-reveal-input ${
            visible ? '' : 'onboarding-api-key-reveal-input--hidden'
          }`.trim()}
        />
        <button
          type="button"
          className="onboarding-api-key-reveal-button"
          onClick={handleToggleVisible}
          aria-label={visible ? 'Ocultar API key' : 'Mostrar API key'}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="onboarding-api-key-reveal-copy-button"
          onClick={handleCopy}
        >
          Copiar
        </Button>
      </div>
      {copied && <span className="onboarding-api-key-reveal-success">Copiado</span>}
    </div>
  );
}
