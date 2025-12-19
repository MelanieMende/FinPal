import TableHeaderCell from './../TableHeaderCell/TableHeaderCell';

export default function TableHeaderRow(props: {columns: any[]}) {

	return (
    <thead>
      <tr>
        {
          props.columns.map((column, i) => (<TableHeaderCell key={"column-" + i} additionalClassNames={column.header.additionalClassNames}>{column.header.content}</TableHeaderCell>))
        }
      </tr>
    </thead>
	);
}