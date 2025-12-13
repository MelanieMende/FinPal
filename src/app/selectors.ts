import { Colors } from "@blueprintjs/core"

export function get_button_text_color(theme: string) {
  return theme == 'bp5-dark' ? Colors.TURQUOISE5 : Colors.TURQUOISE3
}