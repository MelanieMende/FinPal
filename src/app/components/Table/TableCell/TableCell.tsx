import React, { ReactNode } from "react";

type Props = {
  id?: string,
  children?: ReactNode
  additionalClassNames?: string,
  bgColor?: string,
  dataTestID?: string,
  tooltip?: string
}

export default function TableCell({ children, ...props }:Props) {

  const className = "border-2 border-slate-600 px-2 " + props.additionalClassNames + " " + props.bgColor
  const dataTestID = "TableCell" + (props.dataTestID || '')

  return(
    <td id={props.id || ''} data-testid={dataTestID} className={className} title={props.tooltip}>{children}</td>
  )
}

