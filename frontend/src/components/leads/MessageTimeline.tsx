import React from 'react';
import type { Message } from '../../api/endpoints';

export interface MessageTimelineProps {
  messages: Message[];
}

/**
 * Renderiza el timeline de mensajes de un lead en orden cronológico.
 *
 * - Los mensajes se renderizan en el orden recibido (createdAt ascendente).
 * - Los mensajes IN (del lead) se alinean a la izquierda con fondo gris.
 * - Los mensajes OUT (del bot/agente) se alinean a la derecha con fondo azul.
 * - Muestra el contenido (body o transcription para audios), el tipo si es relevante, y la fecha.
 * - Valida AC-4.
 */
export const MessageTimeline: React.FC<MessageTimelineProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <div
        style={{
          padding: '16px',
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: '14px',
        }}
      >
        Sin mensajes aún
      </div>
    );
  }

  // Función para formatear la fecha en español
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const formatter = new Intl.DateTimeFormat('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(date);
  };

  // Función para obtener el contenido del mensaje
  const getMessageContent = (message: Message): string => {
    if (message.type === 'AUDIO' && message.transcription) {
      return message.transcription;
    }
    return message.body || '(sin contenido)';
  };

  // Función para obtener la etiqueta del tipo
  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      TEXT: 'Texto',
      AUDIO: 'Audio',
      IMAGE: 'Imagen',
      DOCUMENT: 'Documento',
      TEMPLATE: 'Template',
      UNSUPPORTED: 'No soportado',
    };
    return labels[type] || type;
  };

  return (
    <div
      data-testid="message-timeline"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        minHeight: '200px',
      }}
    >
      {messages.map((message, index) => {
        const isIncoming = message.direction === 'IN';

        return (
          <div
            key={`${message.id}-${index}`}
            data-testid={`message-${message.id}`}
            data-direction={message.direction}
            style={{
              display: 'flex',
              justifyContent: isIncoming ? 'flex-start' : 'flex-end',
              alignItems: 'flex-start',
              marginBottom: '8px',
            }}
          >
            <div
              data-testid={`message-bubble-${message.id}`}
              style={{
                maxWidth: '70%',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: isIncoming ? '#e5e7eb' : '#3b82f6',
                color: isIncoming ? '#1f2937' : '#ffffff',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {/* Contenido del mensaje */}
              <div
                data-testid={`message-content-${message.id}`}
                style={{
                  fontSize: '14px',
                  lineHeight: '1.5',
                  marginBottom: message.type !== 'TEXT' ? '8px' : '0',
                }}
              >
                {getMessageContent(message)}
              </div>

              {/* Tipo de mensaje (si no es TEXT) */}
              {message.type !== 'TEXT' && (
                <div
                  data-testid={`message-type-${message.id}`}
                  style={{
                    fontSize: '12px',
                    fontStyle: 'italic',
                    opacity: 0.8,
                    marginBottom: '8px',
                  }}
                >
                  [{getTypeLabel(message.type)}]
                </div>
              )}

              {/* Fecha y hora */}
              <div
                data-testid={`message-timestamp-${message.id}`}
                style={{
                  fontSize: '11px',
                  opacity: 0.7,
                  marginTop: '8px',
                }}
              >
                {formatDate(message.createdAt)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
