import TableCell from '../../../../../../components/Table/TableCell/TableCell';

export default function AssetListSumRow(props: {columns: any[] }) {
  
	return (
    <tr id="AssetListSumRow">
      {
        props.columns.map((column, i) => (
          <TableCell key={"column-" + i} id={column.sum_row ? column.sum_row.ID : ''} additionalClassNames={column.sum_row ? column.sum_row.additionalClassNames : ''}>{column.sum_row ? column.sum_row.content : ''}</TableCell>
        ))
      }
    </tr>
	);


}