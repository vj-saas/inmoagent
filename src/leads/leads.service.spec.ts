import type { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';

describe('LeadsService', () => {
  it('hace upsert por (tenantId, phone) para encontrar o crear el lead', async () => {
    const upsert = jest
      .fn()
      .mockResolvedValue({ id: 'lead-1', tenantId: 't1', phone: '54911' });
    const prisma = { lead: { upsert } } as unknown as PrismaService;
    const service = new LeadsService(prisma);

    const lead = await service.findOrCreateByPhone('t1', '54911');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_phone: { tenantId: 't1', phone: '54911' } },
      }),
    );
    expect(lead.id).toBe('lead-1');
  });
});
