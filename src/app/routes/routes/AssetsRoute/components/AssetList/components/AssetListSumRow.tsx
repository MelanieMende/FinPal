import { ReactNode } from 'react';

type Props = {
  columns?: ReactNode[];
  children?: ReactNode;
};

export default function AssetListSumRow({ columns = [], children }: Props) {
  return (
    <tr id="AssetListSumRow" className="bg-white/10 font-bold border-t-2 border-white/10">
      {children || columns.map((column, index) => <td key={index}>{column}</td>)}
    </tr>
  );
}
