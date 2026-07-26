import React from 'react';
import type { Message } from '../../api/endpoints';
import { cn } from '../../lib/cn';

export interface MessageTimelineProps {
  messages: Message[];
}

/** Tono visual de una burbuja del timeline. */
type MessageTone = 'incoming' | 'bot' | 'human';

/**
 * Deriva el tono de un mensaje: los `IN` son siempre del lead ('incoming');
 * los `OUT` son 'human' si tienen `sentByPersonId` (respondió un asesor
 * humano desde el panel manual) o 'bot' si los mandó el agente IA.
 */
function resolveMessageTone(message: Message): MessageTone {
  if (message.direction === 'IN') {
    return 'incoming';
  }
  return message.sentByPersonId ? 'human' : 'bot';
}

/**
 * Renderiza el timeline de mensajes de un lead en orden cronológico.
 *
 * - Los mensajes se renderizan en el orden recibido (createdAt ascendente).
 * - Los mensajes IN (del lead) se alinean a la izquierda, tono 'incoming'.
 * - Los mensajes OUT se alinean a la derecha, con dos tonos posibles:
 *   'bot' (agente IA) o 'human' (asesor humano, tiene `sentByPersonId`), cada
 *   uno con su propia paleta para que se distingan a simple vista (AC-14).
 * - Las burbujas 'human' muestran el email del autor (`sentByPerson.email`).
 * - Muestra el contenido (body o transcription para audios), el tipo si es relevante, y la fecha.
 * - Valida AC-4 y AC-14.
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
        const tone = resolveMessageTone(message);

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
              data-tone={tone}
              className={cn(
                'max-w-[70%] break-words rounded-card p-3',
                tone === 'incoming' && 'bg-border text-text',
                tone === 'bot' && 'bg-primary text-white',
                tone === 'human' && 'bg-warning text-white',
              )}
            >
              {/* Rótulo del autor humano */}
              {tone === 'human' && message.sentByPerson && (
                <div
                  data-testid={`message-author-${message.id}`}
                  className="mb-1 text-xs font-semibold opacity-90"
                >
                  {message.sentByPerson.email}
                </div>
              )}

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
