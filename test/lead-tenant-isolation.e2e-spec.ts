import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

describe('Aislamiento de leads por tenant (e2e)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const suffix = randomBytes(4).toString('hex');
  const samePhone = '5491100000000';
  const tenantIds: string[] = [];

  async function createTenant(slug: string) {
    const tenant = await prisma.tenant.create({
      data: {
        name: `Test Tenant ${slug}`,
        slug,
        phoneNumberId: `phone-number-id-${slug}`,
        accessTokenEnc: 'irrelevante-para-este-test',
        apiKeyHash: 'irrelevante-para-este-test',
      },
    });
    tenantIds.push(tenant.id);
    return tenant;
  }

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); // cascade borra los leads
    await prisma.$disconnect();
  });

  it('permite el mismo teléfono en dos tenants distintos, generando leads independientes', async () => {
    const tenantA = await createTenant(`test-tenant-a-${suffix}`);
    const tenantB = await createTenant(`test-tenant-b-${suffix}`);

    const leadA = await prisma.lead.create({
      data: { tenantId: tenantA.id, phone: samePhone },
    });
    const leadB = await prisma.lead.create({
      data: { tenantId: tenantB.id, phone: samePhone },
    });

    expect(leadA.id).not.toBe(leadB.id);
    expect(leadA.phone).toBe(samePhone);
    expect(leadB.phone).toBe(samePhone);
    expect(leadA.tenantId).toBe(tenantA.id);
    expect(leadB.tenantId).toBe(tenantB.id);

    const leadsForTenantA = await prisma.lead.findMany({
      where: { tenantId: tenantA.id, phone: samePhone },
    });
    const leadsForTenantB = await prisma.lead.findMany({
      where: { tenantId: tenantB.id, phone: samePhone },
    });

    expect(leadsForTenantA).toHaveLength(1);
    expect(leadsForTenantB).toHaveLength(1);
  });

  it('rechaza un segundo lead con el mismo teléfono dentro del mismo tenant', async () => {
    const tenant = await createTenant(`test-tenant-dup-${suffix}`);

    await prisma.lead.create({
      data: { tenantId: tenant.id, phone: samePhone },
    });

    await expect(
      prisma.lead.create({ data: { tenantId: tenant.id, phone: samePhone } }),
    ).rejects.toThrow();
  });
});
