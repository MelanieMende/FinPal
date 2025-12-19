import React, { ReactNode } from "react";
import { useAppSelector } from "../../hooks";

type Props = {
  children?: ReactNode
}

export default function Table({ children, ...props }:Props) {

  const theme = useAppSelector(state => state.appState.theme)

  return(
    <table className={theme}>{children}</table>
  )
}

