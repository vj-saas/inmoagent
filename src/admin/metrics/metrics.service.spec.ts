import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('cuenta cada métrica con los filtros y rango correctos', async () => {
    const leadCount = jest
      .fn()
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    const appointmentCount = jest
      .fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);
    const prisma = {
      lead: { count: leadCount },
      appointment: { count: appointmentCount },
    } as unknown as PrismaService;
    const service = new MetricsService(prisma);

    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-31T23:59:59Z');
    const result = await service.getMetrics('tenant-1', from, to);

    expect(result).toEqual({
      range: { from: from.toISOString(), to: to.toISOString() },
      newLeads: 5,
      activeConversations: 3,
      handoffs: 2,
      appointments: { proposed: 4, confirmed: 1 },
    });

    expect(leadCount).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-1', createdAt: { gte: from, lte: to } },
    });
    expect(appointmentCount).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: 'tenant-1',
        status: 'PROPOSED',
        createdAt: { gte: from, lte: to },
      },
    });
  });
});
