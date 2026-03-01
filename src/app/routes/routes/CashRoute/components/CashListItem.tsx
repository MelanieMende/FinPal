// global `Cash` interface
interface Props {
  i: number,
  cash: CashTransaction
}

export default function CashListItem({ i, cash }: Props) {
  return (
    <tr data-testid={`cash-item-${cash.ID}`}>
      <td>{i}</td>
      <td>{cash.date}</td>
      <td>{cash.type}</td>
      <td>{cash.amount}</td>
      <td>{cash.fee}</td>
      <td>{cash.comment}</td>
      <td></td>
    </tr>
  )
}
