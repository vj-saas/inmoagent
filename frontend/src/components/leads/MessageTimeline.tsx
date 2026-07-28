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

/** Rótulo del autor, en mono, arriba de cada bloque. */
const TONE_LABEL: Record<MessageTone, string> = {
  incoming: 'Lead',
  bot: 'Agente IA',
  human: 'Vos',
};

/**
 * Timeline de mensajes en orden cronológico.
 *
 * Se conserva la metáfora de chat (alineación izquierda/derecha) pero no la
 * burbuja: acá son BLOQUES rectos. Los tres tonos ya no se distinguen por
 * pastel sino por peso — el lead es papel con hairline, el bot es el bloque
 * invertido, y la respuesta humana es el bloque de acento, que es lo que
 * tiene que saltar a la vista cuando alguien del equipo intervino.
 *
 * Cada bloque abre con una línea meta en monoespaciada (autor + hora): el
 * timeline se lee como una transcripción, no como un WhatsApp maquetado.
 *
 * Valida AC-4 y AC-14.
 */
export const MessageTimeline: React.FC<MessageTimelineProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <div className="u-hatch flex min-h-32 items-center justify-center border border-border">
        <span className="u-meta bg-bg px-3 py-2 text-text-muted">Sin mensajes aún</span>
      </div>
    );
  }

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

  const getMessageContent = (message: Message): string => {
    if (message.type === 'AUDIO' && message.transcription) {
      return message.transcription;
    }
    return message.body || '(sin contenido)';
  };

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
      className="flex min-h-52 flex-col gap-4 border border-border bg-bg p-4"
    >
      {messages.map((message, index) => {
        const isIncoming = message.direction === 'IN';
        const tone = resolveMessageTone(message);

        return (
          <div
            key={`${message.id}-${index}`}
            data-testid={`message-${message.id}`}
            data-direction={message.direction}
            className={cn('flex items-start', isIncoming ? 'justify-start' : 'justify-end')}
          >
            <div
              data-testid={`message-bubble-${message.id}`}
              data-tone={tone}
              className={cn(
                'max-w-[78%] break-words px-4 py-3',
                tone === 'incoming' && 'border border-border border-l-2 border-l-border-strong bg-surface text-text',
                tone === 'bot' && 'bg-invert text-on-invert',
                tone === 'human' && 'bg-accent-loud text-on-accent',
              )}
            >
              <div
                className={cn(
                  'u-meta mb-2 flex flex-wrap items-baseline gap-x-2',
                  tone === 'incoming' ? 'text-text-faint' : 'opacity-70',
                )}
              >
                <span>{TONE_LABEL[tone]}</span>
                {tone === 'human' && message.sentByPerson && (
                  <span data-testid={`message-author-${message.id}`}>
                    {message.sentByPerson.email}
                  </span>
                )}
                <span data-testid={`message-timestamp-${message.id}`} className="u-num">
                  {formatDate(message.createdAt)}
                </span>
              </div>

              <div
                data-testid={`message-content-${message.id}`}
                className="text-sm leading-relaxed"
              >
                {getMessageContent(message)}
              </div>

              {message.type !== 'TEXT' && (
                <div data-testid={`message-type-${message.id}`} className="u-meta mt-2 opacity-80">
                  [{getTypeLabel(message.type)}]
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
