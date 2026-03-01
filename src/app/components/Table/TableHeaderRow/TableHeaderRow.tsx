import TableHeaderCell from './../TableHeaderCell/TableHeaderCell';

export interface TableColumn {
  header: {
    content: React.ReactNode;
    additionalClassNames?: string;
  };
  sum_row?: {
    ID?: string;
    content: React.ReactNode;
    additionalClassNames?: string;
  };
}

interface TableHeaderRowProps {
  columns: TableColumn[];
}

export default function TableHeaderRow({ columns }: TableHeaderRowProps) {

	return (
    <thead>
      <tr>
        {
          columns.map((column, i) => (
            <TableHeaderCell key={"column-" + i} additionalClassNames={column.header.additionalClassNames}>
              {column.header.content}
            </TableHeaderCell>
          ))
        }
      </tr>
    </thead>
	);
}