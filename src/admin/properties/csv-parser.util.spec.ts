import { parseCsv } from './csv-parser.util';

describe('parseCsv', () => {
  it('parsea filas simples separadas por coma', () => {
    const rows = parseCsv('a,b,c\n1,2,3');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('respeta campos citados con comas embebidas', () => {
    const rows = parseCsv('title,price\n"Depto, 2 amb",1000');
    expect(rows).toEqual([
      ['title', 'price'],
      ['Depto, 2 amb', '1000'],
    ]);
  });

  it('resuelve comillas escapadas dobles dentro de un campo citado', () => {
    const rows = parseCsv('title\n"Depto ""a nuevo"""');
    expect(rows).toEqual([['title'], ['Depto "a nuevo"']]);
  });

  it('ignora líneas completamente vacías', () => {
    const rows = parseCsv('a,b\n1,2\n\n3,4\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('funciona con CRLF', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
