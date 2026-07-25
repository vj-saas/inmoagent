import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SendManualMessageDto } from './send-manual-message.dto';

describe('SendManualMessageDto', () => {
  it('falla si el texto está vacío', async () => {
    const dto = plainToInstance(SendManualMessageDto, { text: '' });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('falla si el texto tiene solo espacios en blanco (por el trim)', async () => {
    const dto = plainToInstance(SendManualMessageDto, { text: '    ' });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('pasa con un texto válido', async () => {
    const dto = plainToInstance(SendManualMessageDto, { text: 'Hola, ¿en qué te puedo ayudar?' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('falla si el texto supera los 4096 caracteres', async () => {
    const dto = plainToInstance(SendManualMessageDto, { text: 'a'.repeat(4097) });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('pasa con un texto de exactamente 4096 caracteres', async () => {
    const dto = plainToInstance(SendManualMessageDto, { text: 'a'.repeat(4096) });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
