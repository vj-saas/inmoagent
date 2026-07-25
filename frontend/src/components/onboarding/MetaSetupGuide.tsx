/**
 * Guía de copy estático para conectar WhatsApp Business Cloud API (Meta).
 *
 * Puramente presentacional: no hace llamadas al backend. Si el padre conoce
 * la URL pública real del backend puede pasarla en `publicBaseUrl` para
 * mostrarla resuelta; si no, se muestra un placeholder de ejemplo con nota
 * aclaratoria (no existe una env var pública `VITE_PUBLIC_BASE_URL` en este
 * frontend, ver `docs/05-OPERACIONES.md`).
 */

export interface MetaSetupGuideProps {
  publicBaseUrl?: string;
}

export function MetaSetupGuide({ publicBaseUrl }: MetaSetupGuideProps): JSX.Element {
  const baseUrl = publicBaseUrl ?? 'https://tu-dominio.ejemplo.com';
  const webhookUrl = `${baseUrl}/webhook/whatsapp`;

  return (
    <div className="onboarding-card" data-testid="meta-setup-guide">
      <div className="onboarding-card-header">
        <h2 className="onboarding-card-title">Conectá tu WhatsApp Business Cloud API</h2>
        <p className="onboarding-card-description">
          Seguí estos pasos en Meta Business Suite y developers.facebook.com para obtener las
          credenciales que necesita el bot.
        </p>
      </div>
      <div className="onboarding-card-body">
        <ol className="onboarding-checklist">
          <li className="onboarding-checklist-item">
            <div className="onboarding-checklist-item-content">
              <p className="onboarding-checklist-item-title">
                1. Creá una app Business en developers.facebook.com
              </p>
              <p className="onboarding-checklist-item-description">
                Entrá a{' '}
                <a href="https://developers.facebook.com" target="_blank" rel="noreferrer">
                  developers.facebook.com
                </a>
                , creá una app de tipo Business (usando el Business Manager de la inmobiliaria) y
                agregale el producto WhatsApp.
              </p>
            </div>
          </li>

          <li className="onboarding-checklist-item">
            <div className="onboarding-checklist-item-content">
              <p className="onboarding-checklist-item-title">
                2. Copiá el <code>phoneNumberId</code> y el <code>wabaId</code>
              </p>
              <p className="onboarding-checklist-item-description">
                En la configuración de WhatsApp de la app (o en Meta Business Suite, dentro de la
                cuenta de WhatsApp Business del cliente) vas a encontrar el número registrado con
                su <code>phoneNumberId</code> y el ID de la cuenta de WhatsApp Business,{' '}
                <code>wabaId</code>. Ambos son necesarios para dar de alta el tenant.
              </p>
            </div>
          </li>

          <li className="onboarding-checklist-item">
            <div className="onboarding-checklist-item-content">
              <p className="onboarding-checklist-item-title">
                3. Generá un <code>accessToken</code> permanente
              </p>
              <p className="onboarding-checklist-item-description">
                No uses el token temporal de 24 hs que aparece por defecto en el panel de
                pruebas. Creá un <strong>System User</strong> en el Business Manager del cliente,
                asignale el activo de WhatsApp y generá desde ahí un token permanente
                (<code>accessToken</code>) con los permisos de mensajería.
              </p>
            </div>
          </li>

          <li className="onboarding-checklist-item">
            <div className="onboarding-checklist-item-content">
              <p className="onboarding-checklist-item-title">4. Configurá la URL del webhook</p>
              <p className="onboarding-checklist-item-description">
                En la sección de configuración del producto WhatsApp, campo <code>Callback URL</code>,
                cargá tu URL de webhook:{' '}
                <code data-testid="meta-setup-guide-webhook-url">{webhookUrl}</code>
                {publicBaseUrl === undefined && (
                  <>
                    {' '}
                    (reemplazá <code>{baseUrl}</code> por tu dominio real de{' '}
                    <code>PUBLIC_BASE_URL</code>).
                  </>
                )}{' '}
                Suscribí el campo <code>messages</code>.
              </p>
            </div>
          </li>

          <li className="onboarding-checklist-item">
            <div className="onboarding-checklist-item-content">
              <p className="onboarding-checklist-item-title">
                5. Definí el <code>META_VERIFY_TOKEN</code>
              </p>
              <p className="onboarding-checklist-item-description">
                Junto a la URL del webhook, Meta te pide un <code>Verify Token</code>: es un valor
                que vos elegís (una cadena secreta arbitraria) y que debe coincidir exactamente con
                la variable de entorno <code>META_VERIFY_TOKEN</code> configurada en el backend.
                Meta lo usa para validar la suscripción del webhook (paso de verificación GET).
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
