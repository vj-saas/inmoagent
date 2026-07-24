import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Message } from '../../api/endpoints';
import { MessageTimeline } from './MessageTimeline';

describe('MessageTimeline Component', () => {
  beforeEach(() => {
    cleanup();
  });

  // Mock de mensajes de prueba
  const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
    id: 'msg-' + Math.random().toString(36).substr(2, 9),
    tenantId: 'tenant-1',
    leadId: 'lead-1',
    direction: 'IN',
    type: 'TEXT',
    waMessageId: null,
    body: 'Test message',
    mediaId: null,
    transcription: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it('renderiza un mensaje vacío cuando no hay mensajes', () => {
    render(<MessageTimeline messages={[]} />);
    expect(screen.getByText('Sin mensajes aún')).toBeInTheDocument();
  });

  it('renderiza un único mensaje', () => {
    const message = createMockMessage({ body: 'Hola, busco un departamento' });
    render(<MessageTimeline messages={[message]} />);

    expect(screen.getByTestId(`message-${message.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`message-content-${message.id}`)).toHaveTextContent(
      'Hola, busco un departamento',
    );
  });

  it('renderiza múltiples mensajes en orden ascendente (sin reordenar)', () => {
    const msg1 = createMockMessage({
      id: 'msg-1',
      body: 'Primer mensaje',
      createdAt: new Date('2026-07-24T09:00:00Z').toISOString(),
    });
    const msg2 = createMockMessage({
      id: 'msg-2',
      body: 'Segundo mensaje',
      createdAt: new Date('2026-07-24T09:05:00Z').toISOString(),
    });
    const msg3 = createMockMessage({
      id: 'msg-3',
      body: 'Tercer mensaje',
      createdAt: new Date('2026-07-24T09:10:00Z').toISOString(),
    });

    render(<MessageTimeline messages={[msg1, msg2, msg3]} />);

    // Verificar que todos los mensajes se renderizan
    expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg-3')).toBeInTheDocument();

    // Verificar que el orden es el correcto (sin reordenar)
    const messages = screen.getAllByTestId(/^message-msg-\d$/);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toHaveTextContent('Primer mensaje');
    expect(messages[1]).toHaveTextContent('Segundo mensaje');
    expect(messages[2]).toHaveTextContent('Tercer mensaje');
  });

  it('distingue visualmente un mensaje IN (alineación a la izquierda, fondo gris)', () => {
    const inMessage = createMockMessage({
      direction: 'IN',
      body: 'Mensaje entrante del lead',
    });
    render(<MessageTimeline messages={[inMessage]} />);

    const messageElement = screen.getByTestId(`message-${inMessage.id}`);
    const bubbleElement = screen.getByTestId(`message-bubble-${inMessage.id}`);

    // Verificar data-direction
    expect(messageElement).toHaveAttribute('data-direction', 'IN');

    // Verificar estilos: alineación izquierda y fondo gris
    const containerStyle = messageElement.getAttribute('style') || '';
    expect(containerStyle).toContain('flex-start');

    const bubbleStyle = bubbleElement.getAttribute('style') || '';
    // React convierte hex a rgb(), verificar el color en formato rgb
    expect(bubbleStyle).toContain('rgb(229, 231, 235)'); // gris claro (#e5e7eb en rgb)
  });

  it('distingue visualmente un mensaje OUT (alineación a la derecha, fondo azul)', () => {
    const outMessage = createMockMessage({
      direction: 'OUT',
      body: 'Mensaje saliente del bot',
    });
    render(<MessageTimeline messages={[outMessage]} />);

    const messageElement = screen.getByTestId(`message-${outMessage.id}`);
    const bubbleElement = screen.getByTestId(`message-bubble-${outMessage.id}`);

    // Verificar data-direction
    expect(messageElement).toHaveAttribute('data-direction', 'OUT');

    // Verificar estilos: alineación derecha y fondo azul
    const containerStyle = messageElement.getAttribute('style') || '';
    expect(containerStyle).toContain('flex-end');

    const bubbleStyle = bubbleElement.getAttribute('style') || '';
    // React convierte hex a rgb(), verificar el color en formato rgb
    expect(bubbleStyle).toContain('rgb(59, 130, 246)'); // azul (#3b82f6 en rgb)
  });

  it('muestra el contenido de un mensaje de texto', () => {
    const message = createMockMessage({
      type: 'TEXT',
      body: 'Contenido del mensaje',
    });
    render(<MessageTimeline messages={[message]} />);

    expect(screen.getByTestId(`message-content-${message.id}`)).toHaveTextContent(
      'Contenido del mensaje',
    );
  });

  it('muestra la transcripción para mensajes de audio', () => {
    const audioMessage = createMockMessage({
      type: 'AUDIO',
      body: null,
      transcription: 'Transcripción del audio',
    });
    render(<MessageTimeline messages={[audioMessage]} />);

    expect(screen.getByTestId(`message-content-${audioMessage.id}`)).toHaveTextContent(
      'Transcripción del audio',
    );
  });

  it('muestra el tipo de mensaje para no-TEXT', () => {
    const audioMessage = createMockMessage({
      type: 'AUDIO',
      body: null,
      transcription: 'Audio transcrito',
    });
    const imageMessage = createMockMessage({
      type: 'IMAGE',
      body: 'Imagen enviada',
    });

    render(
      <MessageTimeline
        messages={[audioMessage, imageMessage]}
      />
    );

    expect(screen.getByTestId(`message-type-${audioMessage.id}`)).toHaveTextContent('[Audio]');
    expect(screen.getByTestId(`message-type-${imageMessage.id}`)).toHaveTextContent('[Imagen]');
  });

  it('no muestra el tipo para mensajes de texto', () => {
    const textMessage = createMockMessage({
      type: 'TEXT',
      body: 'Mensaje de texto',
    });
    render(<MessageTimeline messages={[textMessage]} />);

    expect(screen.queryByTestId(`message-type-${textMessage.id}`)).not.toBeInTheDocument();
  });

  it('muestra la fecha y hora en formato español', () => {
    const message = createMockMessage({
      createdAt: '2026-07-24T14:30:45Z',
    });
    render(<MessageTimeline messages={[message]} />);

    const timestampElement = screen.getByTestId(`message-timestamp-${message.id}`);
    expect(timestampElement).toBeInTheDocument();
    // Verificar que contiene una fecha (formato flexible porque depende del locale)
    expect(timestampElement.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('muestra "(sin contenido)" cuando no hay body ni transcription', () => {
    const emptyMessage = createMockMessage({
      body: null,
      transcription: null,
      type: 'TEXT',
    });
    render(<MessageTimeline messages={[emptyMessage]} />);

    expect(screen.getByTestId(`message-content-${emptyMessage.id}`)).toHaveTextContent(
      '(sin contenido)',
    );
  });

  it('renderiza secuencia realista: IN del lead, OUT del bot, IN del lead', () => {
    const messages: Message[] = [
      createMockMessage({
        id: 'msg-in-1',
        direction: 'IN',
        type: 'TEXT',
        body: '¿Tienen departamentos?',
        createdAt: '2026-07-24T09:00:00Z',
      }),
      createMockMessage({
        id: 'msg-out-1',
        direction: 'OUT',
        type: 'TEXT',
        body: 'Sí, tenemos varias opciones. ¿Cuál es tu presupuesto?',
        createdAt: '2026-07-24T09:02:00Z',
      }),
      createMockMessage({
        id: 'msg-in-2',
        direction: 'IN',
        type: 'TEXT',
        body: 'Hasta USD 500.000',
        createdAt: '2026-07-24T09:05:00Z',
      }),
    ];

    render(<MessageTimeline messages={messages} />);

    // Verificar que todos los mensajes se renderizan
    expect(screen.getByTestId('message-msg-in-1')).toHaveAttribute('data-direction', 'IN');
    expect(screen.getByTestId('message-msg-out-1')).toHaveAttribute('data-direction', 'OUT');
    expect(screen.getByTestId('message-msg-in-2')).toHaveAttribute('data-direction', 'IN');

    // Verificar que se mantiene el orden
    const allMessages = screen.getAllByTestId(/^message-msg-/);
    expect(allMessages[0]).toHaveTextContent('¿Tienen departamentos?');
    expect(allMessages[1]).toHaveTextContent('Sí, tenemos varias opciones');
    expect(allMessages[2]).toHaveTextContent('Hasta USD 500.000');
  });

  it('renderiza audio con transcripción y tipo [Audio]', () => {
    const audioMessage = createMockMessage({
      id: 'msg-audio-1',
      direction: 'IN',
      type: 'AUDIO',
      body: null,
      transcription: 'Busco algo en zona norte, cercano a la estación',
      createdAt: '2026-07-24T09:00:00Z',
    });

    render(<MessageTimeline messages={[audioMessage]} />);

    expect(screen.getByTestId('message-msg-audio-1')).toBeInTheDocument();
    expect(screen.getByTestId('message-content-msg-audio-1')).toHaveTextContent(
      'Busco algo en zona norte, cercano a la estación',
    );
    expect(screen.getByTestId('message-type-msg-audio-1')).toHaveTextContent('[Audio]');
  });

  it('renderiza imagen con tipo [Imagen]', () => {
    const imageMessage = createMockMessage({
      id: 'msg-img-1',
      direction: 'IN',
      type: 'IMAGE',
      body: 'Foto de la zona que me interesa',
      mediaId: 'media-123',
      createdAt: '2026-07-24T09:00:00Z',
    });

    render(<MessageTimeline messages={[imageMessage]} />);

    expect(screen.getByTestId('message-msg-img-1')).toBeInTheDocument();
    expect(screen.getByTestId('message-content-msg-img-1')).toHaveTextContent(
      'Foto de la zona que me interesa',
    );
    expect(screen.getByTestId('message-type-msg-img-1')).toHaveTextContent('[Imagen]');
  });

  it('AC-4: renderiza en orden cronológico sin reordenar y distingue IN/OUT visualmente', () => {
    // Este test integra la validación de AC-4 completa
    const messages: Message[] = [
      createMockMessage({
        id: 'ac4-msg-1',
        direction: 'IN',
        type: 'TEXT',
        body: 'Hola',
        createdAt: '2026-07-24T10:00:00Z',
      }),
      createMockMessage({
        id: 'ac4-msg-2',
        direction: 'OUT',
        type: 'TEXT',
        body: 'Hola, ¿en qué puedo ayudarte?',
        createdAt: '2026-07-24T10:01:00Z',
      }),
      createMockMessage({
        id: 'ac4-msg-3',
        direction: 'IN',
        type: 'AUDIO',
        body: null,
        transcription: 'Busco un departamento en Palermo',
        createdAt: '2026-07-24T10:02:00Z',
      }),
    ];

    render(<MessageTimeline messages={messages} />);

    // Verificar orden
    const messageElements = screen.getAllByTestId(/^message-ac4-msg-/);
    expect(messageElements[0]).toHaveTextContent('Hola');
    expect(messageElements[1]).toHaveTextContent('Hola, ¿en qué puedo ayudarte?');
    expect(messageElements[2]).toHaveTextContent('Busco un departamento en Palermo');

    // Verificar direcciones
    expect(messageElements[0]).toHaveAttribute('data-direction', 'IN');
    expect(messageElements[1]).toHaveAttribute('data-direction', 'OUT');
    expect(messageElements[2]).toHaveAttribute('data-direction', 'IN');

    // Verificar estilos visuales (IN vs OUT)
    const bubble1 = screen.getByTestId('message-bubble-ac4-msg-1');
    const bubble2 = screen.getByTestId('message-bubble-ac4-msg-2');
    const bubble3 = screen.getByTestId('message-bubble-ac4-msg-3');

    const style1 = bubble1.getAttribute('style') || '';
    const style2 = bubble2.getAttribute('style') || '';
    const style3 = bubble3.getAttribute('style') || '';

    // IN messages tienen fondo gris (React convierte hex a rgb)
    expect(style1).toContain('rgb(229, 231, 235)');
    // OUT message tiene fondo azul
    expect(style2).toContain('rgb(59, 130, 246)');
    // Otro IN message
    expect(style3).toContain('rgb(229, 231, 235)');
  });
});
