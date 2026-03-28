import React, { ReactNode } from "react";
import { useAppSelector } from "../../hooks";

type Props = {
  children?: ReactNode,
  className?: string
}

export default function Table({ children, className, ...props }:Props) {

  const theme = useAppSelector(state => state.appState.theme)

  return(
    <table className={theme + " " + (className || "")}>{children}</table>
  )
}

