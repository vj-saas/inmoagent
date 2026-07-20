import type { ConfigService } from '@nestjs/config';
import type { Lead, Tenant } from '@prisma/client';
import type { EnvConfig } from '../config/env.schema';
import { OpenAiLlmProvider } from './openai-llm.provider';

const TENANT = {
  botName: 'Sofía',
  name: 'Inmobiliaria Demo',
  botTone: 'cordial',
  competitorsToAvoid: [],
} as unknown as Tenant;
const LEAD = {} as Lead;

function buildProvider() {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'sk-test';
      if (key === 'LLM_MODEL') return 'gpt-4o-mini';
      return undefined;
    }),
  } as unknown as ConfigService<EnvConfig, true>;
  return new OpenAiLlmProvider(config);
}

function chatResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  };
}

describe('OpenAiLlmProvider', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const validExtractionJson = JSON.stringify({
    intent: 'provide_info',
    operation: 'RENT',
    neighborhoods: ['Caballito'],
    maxPrice: 500000,
    currency: 'ARS',
    minRooms: 2,
    wantsGarage: null,
    wantsPetsAllowed: null,
    roomsInferred: false,
    extraRequirements: null,
    interestedPropertyIndex: null,
  });

  it('extractIntent parsea y sanitiza una respuesta válida en el primer intento', async () => {
    fetchMock.mockResolvedValueOnce(chatResponse(validExtractionJson));
    const provider = buildProvider();

    const result = await provider.extractIntent({
      tenant: TENANT,
      lead: LEAD,
      turnText: 'busco depto',
      recentMessages: [],
    });

    expect(result?.operation).toBe('RENT');
    expect(result?.neighborhoods).toEqual(['caballito']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reintenta una vez si la primera respuesta no matchea el schema, y usa la segunda si es válida', async () => {
    fetchMock
      .mockResolvedValueOnce(chatResponse('esto no es JSON'))
      .mockResolvedValueOnce(chatResponse(validExtractionJson));
    const provider = buildProvider();

    const result = await provider.extractIntent({
      tenant: TENANT,
      lead: LEAD,
      turnText: 'busco depto',
      recentMessages: [],
    });

    expect(result?.operation).toBe('RENT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('devuelve null (para pedir reformular) si ambos intentos fallan', async () => {
    fetchMock
      .mockResolvedValueOnce(chatResponse('no-json'))
      .mockResolvedValueOnce(chatResponse('{"intent":"tipo_invalido"}'));
    const provider = buildProvider();

    const result = await provider.extractIntent({
      tenant: TENANT,
      lead: LEAD,
      turnText: 'asdkjasd',
      recentMessages: [],
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('composeReply arma el prompt con historial y devuelve el texto', async () => {
    fetchMock.mockResolvedValueOnce(
      chatResponse('  Hola! ¿Buscás para comprar o alquilar?  '),
    );
    const provider = buildProvider();

    const reply = await provider.composeReply({
      tenant: TENANT,
      lead: LEAD,
      recentMessages: [{ direction: 'IN', body: 'hola' }],
      instruction: 'Saludá y preguntá operación',
    });

    expect(reply).toBe('Hola! ¿Buscás para comprar o alquilar?');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0].role).toBe('system');
    expect(
      body.messages.some((m) => m.role === 'user' && m.content === 'hola'),
    ).toBe(true);
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Saludá y preguntá operación',
    });
  });

  it('composeReply lanza un error legible si OpenAI responde con error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
    });
    const provider = buildProvider();

    await expect(
      provider.composeReply({
        tenant: TENANT,
        lead: LEAD,
        recentMessages: [],
        instruction: 'x',
      }),
    ).rejects.toThrow(/Invalid API key/);
  });
});
