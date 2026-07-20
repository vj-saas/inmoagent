import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { MetaGraphClient } from './meta-graph.client';

function configWith(sandboxAr: boolean): ConfigService<EnvConfig, true> {
  return {
    get: jest.fn((key: string) =>
      key === 'WA_SANDBOX_AR_RECIPIENT' ? sandboxAr : undefined,
    ),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe('MetaGraphClient', () => {
  const originalFetch = global.fetch;
  const configOff = configWith(false);
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function jsonResponse(status: number, body: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'status-text',
      json: () => Promise.resolve(body),
    };
  }

  it('sendText llama al endpoint /messages con el payload de texto correcto', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: 'wamid.out.1' }] }),
    );
    const client = new MetaGraphClient(configOff);

    const result = await client.sendText(
      'phone-1',
      'token-abc',
      '5491100000000',
      'hola que tal',
    );

    expect(result).toEqual({ waMessageId: 'wamid.out.1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/phone-1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
      }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '5491100000000',
      type: 'text',
      text: { body: 'hola que tal' },
    });
  });

  it('sendImage arma el payload de imagen con link y caption', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: 'wamid.out.2' }] }),
    );
    const client = new MetaGraphClient(configOff);

    await client.sendImage(
      'phone-1',
      'token-abc',
      '5491100000000',
      'https://img/1.jpg',
      'lindo depto',
    );

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '5491100000000',
      type: 'image',
      image: { link: 'https://img/1.jpg', caption: 'lindo depto' },
    });
  });

  it('markAsRead envía status read con el message_id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const client = new MetaGraphClient(configOff);

    await client.markAsRead('phone-1', 'token-abc', 'wamid.in.1');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.in.1',
    });
  });

  it('sendTemplate arma el payload de template con nombre/idioma/parámetros', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: 'wamid.out.3' }] }),
    );
    const client = new MetaGraphClient(configOff);

    await client.sendTemplate(
      'phone-1',
      'token-abc',
      '5491100000000',
      'lead_alert',
      'es_AR',
      ['Juan', '5491100000000', 'alquiler en caballito', 'Depto en Caballito'],
    );

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '5491100000000',
      type: 'template',
      template: {
        name: 'lead_alert',
        language: { code: 'es_AR' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Juan' },
              { type: 'text', text: '5491100000000' },
              { type: 'text', text: 'alquiler en caballito' },
              { type: 'text', text: 'Depto en Caballito' },
            ],
          },
        ],
      },
    });
  });

  it('lanza un error legible cuando Meta responde con error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { message: 'Invalid OAuth access token' } }),
    );
    const client = new MetaGraphClient(configOff);

    await expect(
      client.sendText('phone-1', 'token-malo', '5491100000000', 'hola'),
    ).rejects.toThrow(/Invalid OAuth access token/);
  });

  it('con WA_SANDBOX_AR_RECIPIENT off, el destinatario va tal cual (wa_id)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: 'wamid.x' }] }),
    );
    const client = new MetaGraphClient(configOff);

    await client.sendText('phone-1', 'token', '5491131838472', 'hola');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(options.body as string) as { to: string }).to).toBe(
      '5491131838472',
    );
  });

  it('con WA_SANDBOX_AR_RECIPIENT on, reescribe el celular AR al formato con "15"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: 'wamid.x' }] }),
    );
    const client = new MetaGraphClient(configWith(true));

    await client.sendText('phone-1', 'token', '5491131838472', 'hola');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(options.body as string) as { to: string }).to).toBe(
      '54111531838472',
    );
  });
});
