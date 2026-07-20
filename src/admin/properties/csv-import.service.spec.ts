import { BadRequestException } from '@nestjs/common';
import type { PropertiesAdminService } from './properties-admin.service';
import { CsvImportService } from './csv-import.service';

const HEADER =
  'external_ref,title,description,operation,property_type,price,currency,expenses,neighborhood,city,address,rooms,bedrooms,bathrooms,area_m2,garage,pets_allowed,features,listing_url,photo_urls';

function validRow(ref: string): string {
  return `${ref},Depto ${ref},Lindo depto,alquiler,departamento,450000,ARS,50000,caballito,CABA,,2,1,1,45,si,no,balcon;luminoso,https://example.com/${ref},https://img/${ref}-1.jpg;https://img/${ref}-2.jpg`;
}

function build() {
  const upsertByExternalRef = jest.fn().mockResolvedValue({});
  const properties = {
    upsertByExternalRef,
  } as unknown as PropertiesAdminService;
  return { service: new CsvImportService(properties), upsertByExternalRef };
}

describe('CsvImportService', () => {
  it('rechaza un CSV sin las columnas obligatorias', async () => {
    const { service } = build();
    await expect(
      service.import('tenant-1', 'title,price\nfoo,100'),
    ).rejects.toThrow(BadRequestException);
  });

  it('importa filas válidas y reporta errores fila por fila sin abortar el batch', async () => {
    const { service, upsertByExternalRef } = build();
    const rows = [
      HEADER,
      validRow('p1'),
      'p2,Sin operación válida,,invalida,departamento,100000,USD,,caballito,,,,,,,,,,,,', // operation inválida
      validRow('p3'),
      ',Sin external_ref,,alquiler,departamento,100000,USD,,caballito,,,,,,,,,,,,', // falta external_ref
      validRow('p5'),
    ].join('\n');

    const result = await service.import('tenant-1', rows);

    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((e) => e.row)).toEqual([3, 5]);
    expect(upsertByExternalRef).toHaveBeenCalledTimes(3);
  });

  it('mapea correctamente operation/garage/pets_allowed/features/photo_urls', async () => {
    const { service, upsertByExternalRef } = build();
    await service.import('tenant-1', `${HEADER}\n${validRow('p1')}`);

    expect(upsertByExternalRef).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        externalRef: 'p1',
        operation: 'RENT',
        garage: true,
        petsAllowed: false,
        features: ['balcon', 'luminoso'],
        photoUrls: ['https://img/p1-1.jpg', 'https://img/p1-2.jpg'],
        neighborhood: 'caballito',
      }),
    );
  });

  it('sigue importando el resto de las filas aunque una falle al guardarse (ej: constraint)', async () => {
    const { service, upsertByExternalRef } = build();
    upsertByExternalRef
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});

    const rows = [HEADER, validRow('p1'), validRow('p2'), validRow('p3')].join(
      '\n',
    );
    const result = await service.import('tenant-1', rows);

    expect(result.imported).toBe(2);
    expect(result.errors).toEqual([{ row: 3, message: 'boom' }]);
  });
});
