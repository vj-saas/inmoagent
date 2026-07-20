import type { Lead, Tenant } from '@prisma/client';
import type { LlmProvider } from '../llm/llm-provider.interface';
import { OutputValidatorService } from './output-validator.service';
import { SafeReplyService } from './safe-reply.service';

const TENANT = { competitorsToAvoid: ['Remax'] } as Tenant;
const LEAD = {} as Lead;

function build(composeReplyImpl: jest.Mock) {
  const llm = { composeReply: composeReplyImpl } as unknown as LlmProvider;
  const service = new SafeReplyService(llm, new OutputValidatorService());
  return { service, llm };
}

describe('SafeReplyService', () => {
  it('devuelve la respuesta del LLM tal cual si no viola nada', async () => {
    const { service } = build(
      jest.fn().mockResolvedValue('Hola! ¿Comprás o alquilás?'),
    );

    const reply = await service.compose(
      {
        tenant: TENANT,
        lead: LEAD,
        recentMessages: [],
        instruction: 'saludar',
      },
      'fallback',
    );

    expect(reply).toBe('Hola! ¿Comprás o alquilás?');
  });

  it('re-redacta una vez si menciona un competidor, y usa la segunda si ya es válida', async () => {
    const composeReply = jest
      .fn()
      .mockResolvedValueOnce('Somos mejores que Remax')
      .mockResolvedValueOnce('Tenemos buenas opciones para vos');
    const { service, llm } = build(composeReply);

    const reply = await service.compose(
      {
        tenant: TENANT,
        lead: LEAD,
        recentMessages: [],
        instruction: 'responder',
      },
      'fallback',
    );

    expect(reply).toBe('Tenemos buenas opciones para vos');
    expect(llm.composeReply).toHaveBeenCalledTimes(2);
  });

  it('usa el fallback determinístico si la mención persiste tras el reintento', async () => {
    const composeReply = jest.fn().mockResolvedValue('Somos mejores que Remax');
    const { service } = build(composeReply);

    const reply = await service.compose(
      {
        tenant: TENANT,
        lead: LEAD,
        recentMessages: [],
        instruction: 'responder',
      },
      'fallback determinístico',
    );

    expect(reply).toBe('fallback determinístico');
  });

  it('usa el fallback de inmediato (sin reintentar) si detecta datos sensibles', async () => {
    const composeReply = jest
      .fn()
      .mockResolvedValue('tu token es sk-abcdefghijklmnopqrstuvwx');
    const { service, llm } = build(composeReply);

    const reply = await service.compose(
      {
        tenant: TENANT,
        lead: LEAD,
        recentMessages: [],
        instruction: 'responder',
      },
      'fallback',
    );

    expect(reply).toBe('fallback');
    expect(llm.composeReply).toHaveBeenCalledTimes(1);
  });
});
