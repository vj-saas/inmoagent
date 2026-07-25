import React from 'react';
import type { Message } from '../../api/endpoints';
import { cn } from '../../lib/cn';

export interface MessageTimelineProps {
  messages: Message[];
}

/**
 * Renderiza el timeline de mensajes de un lead en orden cronológico.
 *
 * - Los mensajes se renderizan en el orden recibido (createdAt ascendente).
 * - Los mensajes IN (del lead) se alinean a la izquierda con fondo neutro.
 * - Los mensajes OUT (del bot/agente) se alinean a la derecha con fondo primario.
 * - Muestra el contenido (body o transcription para audios), el tipo si es relevante, y la fecha.
 * - Valida AC-4.
 */
export const MessageTimeline: React.FC<MessageTimelineProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-text-muted">Sin mensajes aún</div>
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
      className="flex min-h-52 flex-col gap-3 rounded-card bg-bg p-4"
    >
      {messages.map((message, index) => {
        const isIncoming = message.direction === 'IN';

        return (
          <div
            key={`${message.id}-${index}`}
            data-testid={`message-${message.id}`}
            data-direction={message.direction}
            className={cn(
              'mb-2 flex items-start',
              isIncoming ? 'justify-start' : 'justify-end',
            )}
          >
            <div
              data-testid={`message-bubble-${message.id}`}
              data-tone={isIncoming ? 'incoming' : 'outgoing'}
              className={cn(
                'max-w-[70%] break-words rounded-card p-3',
                isIncoming ? 'bg-border text-text' : 'bg-primary text-white',
              )}
            >
              {/* Contenido del mensaje */}
              <div
                data-testid={`message-content-${message.id}`}
                className={cn('text-sm leading-normal', message.type !== 'TEXT' ? 'mb-2' : 'mb-0')}
              >
                {getMessageContent(message)}
              </div>

              {/* Tipo de mensaje (si no es TEXT) */}
              {message.type !== 'TEXT' && (
                <div
                  data-testid={`message-type-${message.id}`}
                  className="mb-2 text-xs italic opacity-80"
                >
                  [{getTypeLabel(message.type)}]
                </div>
              )}

              {/* Fecha y hora */}
              <div
                data-testid={`message-timestamp-${message.id}`}
                className="mt-2 text-xs opacity-70"
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
