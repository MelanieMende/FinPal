import React from 'react';
import { render, screen } from '@testing-library/react';
import TableHeaderRow from './TableHeaderRow';
import TableHeaderCell from './../TableHeaderCell/TableHeaderCell';

describe('TableHeaderRow Component', () => {
  it('should render a <thead> element', () => {
    render(<TableHeaderRow columns={[]} />);
    const theadElement = screen.getByRole('rowgroup');
    expect(theadElement).toBeInTheDocument();
  });

  it('should render a <tr> element inside <thead>', () => {
    render(<TableHeaderRow columns={[]} />);
    const rowElement = screen.getByRole('row');
    expect(rowElement).toBeInTheDocument();
  });

  it('should render the correct number of TableHeaderCell components', () => {
    const columns = [
      { header: { content: 'Column 1', additionalClassNames: 'class1' } },
      { header: { content: 'Column 2', additionalClassNames: 'class2' } },
    ];
    render(<TableHeaderRow columns={columns} />);
    const cells = screen.getAllByRole('columnheader');
    expect(cells.length).toBe(columns.length);
  });

  it('should render the correct content for each TableHeaderCell', () => {
    const columns = [
      { header: { content: 'Column 1', additionalClassNames: 'class1' } },
      { header: { content: 'Column 2', additionalClassNames: 'class2' } },
    ];
    render(<TableHeaderRow columns={columns} />);
    columns.forEach((column) => {
      expect(screen.getByText(column.header.content)).toBeInTheDocument();
    });
  });

  it('should handle an empty columns array gracefully', () => {
    render(<TableHeaderRow columns={[]} />);
    const cells = screen.queryAllByRole('columnheader');
    expect(cells.length).toBe(0);
  });

  it('should apply the correct class names to each TableHeaderCell', () => {
    const columns = [
      { header: { content: 'Column 1', additionalClassNames: 'class1' } },
      { header: { content: 'Column 2', additionalClassNames: 'class2' } },
    ];
    render(<TableHeaderRow columns={columns} />);
    columns.forEach((column) => {
      const cell = screen.getByText(column.header.content);
      expect(cell).toHaveClass(column.header.additionalClassNames);
    });
  });
});