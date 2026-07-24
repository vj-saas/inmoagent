import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TableScroll, Table, THead, TBody, Tr, Th, Td } from './Table';

describe('Table primitives', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders a full table with headers and rows inside TableScroll', () => {
    render(
      <TableScroll data-testid="scroll">
        <Table>
          <THead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Estado</Th>
            </Tr>
          </THead>
          <TBody>
            <Tr>
              <Td>Juan</Td>
              <Td>Nuevo</Td>
            </Tr>
          </TBody>
        </Table>
      </TableScroll>
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Juan' })).toBeInTheDocument();
  });

  it('TableScroll applies overflow-x-auto (key for AC-8)', () => {
    render(<TableScroll data-testid="scroll">contenido</TableScroll>);
    expect(screen.getByTestId('scroll').className).toContain('overflow-x-auto');
  });

  it('merges custom classNames on each element', () => {
    render(
      <TableScroll className="scroll-extra" data-testid="scroll">
        <Table className="table-extra">
          <THead className="thead-extra">
            <Tr className="tr-extra">
              <Th className="th-extra">H</Th>
            </Tr>
          </THead>
          <TBody className="tbody-extra">
            <Tr>
              <Td className="td-extra">D</Td>
            </Tr>
          </TBody>
        </Table>
      </TableScroll>
    );
    expect(screen.getByTestId('scroll').className).toContain('scroll-extra');
    expect(screen.getByRole('table').className).toContain('table-extra');
    expect(screen.getByRole('columnheader').className).toContain('th-extra');
    expect(screen.getByRole('cell').className).toContain('td-extra');
  });
});
