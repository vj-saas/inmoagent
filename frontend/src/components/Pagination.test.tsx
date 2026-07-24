import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination Component', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders pagination component', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={1}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('displays the correct page text', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={3}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    expect(screen.getByTestId('pagination-text')).toHaveTextContent(
      'Página 3 de 10'
    );
  });

  it('calculates totalPages correctly using ceil', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={25}
        page={1}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    // 25 / 10 = 2.5, ceil(2.5) = 3
    expect(screen.getByTestId('pagination-text')).toHaveTextContent(
      'Página 1 de 3'
    );
  });

  it('disables Previous button on first page', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={1}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const prevBtn = screen.getByTestId('pagination-previous-btn');
    expect(prevBtn).toBeDisabled();
  });

  it('disables Next button on last page', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={10}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const nextBtn = screen.getByTestId('pagination-next-btn');
    expect(nextBtn).toBeDisabled();
  });

  it('enables both buttons on middle pages', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={5}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const prevBtn = screen.getByTestId('pagination-previous-btn');
    const nextBtn = screen.getByTestId('pagination-next-btn');
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();
  });

  it('disables both buttons when totalPages is 0', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={0}
        page={1}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const prevBtn = screen.getByTestId('pagination-previous-btn');
    const nextBtn = screen.getByTestId('pagination-next-btn');
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });

  it('disables both buttons when totalPages is 1', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={5}
        page={1}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const prevBtn = screen.getByTestId('pagination-previous-btn');
    const nextBtn = screen.getByTestId('pagination-next-btn');
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeDisabled();
  });

  it('calls onPageChange with page - 1 when Previous button is clicked', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={5}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const prevBtn = screen.getByTestId('pagination-previous-btn');
    fireEvent.click(prevBtn);
    expect(mockOnPageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange with page + 1 when Next button is clicked', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={5}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const nextBtn = screen.getByTestId('pagination-next-btn');
    fireEvent.click(nextBtn);
    expect(mockOnPageChange).toHaveBeenCalledWith(6);
  });

  it('does not call onPageChange when Previous button is disabled', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={1}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const prevBtn = screen.getByTestId('pagination-previous-btn');
    fireEvent.click(prevBtn);
    expect(mockOnPageChange).not.toHaveBeenCalled();
  });

  it('does not call onPageChange when Next button is disabled', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={100}
        page={10}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    const nextBtn = screen.getByTestId('pagination-next-btn');
    fireEvent.click(nextBtn);
    expect(mockOnPageChange).not.toHaveBeenCalled();
  });

  it('renders both buttons and text correctly', () => {
    const mockOnPageChange = vi.fn();
    render(
      <Pagination
        total={50}
        page={2}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    expect(screen.getByTestId('pagination-previous-btn')).toHaveTextContent(
      'Anterior'
    );
    expect(screen.getByTestId('pagination-next-btn')).toHaveTextContent(
      'Siguiente'
    );
    expect(screen.getByTestId('pagination-text')).toHaveTextContent(
      'Página 2 de 5'
    );
  });

  it('updates when props change', () => {
    const mockOnPageChange = vi.fn();
    const { rerender } = render(
      <Pagination
        total={100}
        page={1}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    expect(screen.getByTestId('pagination-text')).toHaveTextContent(
      'Página 1 de 10'
    );

    rerender(
      <Pagination
        total={100}
        page={5}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    expect(screen.getByTestId('pagination-text')).toHaveTextContent(
      'Página 5 de 10'
    );

    rerender(
      <Pagination
        total={100}
        page={10}
        pageSize={10}
        onPageChange={mockOnPageChange}
      />
    );
    expect(screen.getByTestId('pagination-text')).toHaveTextContent(
      'Página 10 de 10'
    );
  });
});
