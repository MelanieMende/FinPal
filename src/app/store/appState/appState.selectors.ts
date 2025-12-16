import {
	Colors,
} from '@blueprintjs/core';

export function getBgColor(state?: { theme: any; }, type?: string) {

	if (!state) return Colors.LIGHT_GRAY5;

	if (type == "dark")
		return state.theme == 'bp3-dark' ? Colors.DARK_GRAY3 : Colors.LIGHT_GRAY5;
	else
		return state.theme == 'bp3-dark' ? Colors.DARK_GRAY3 : Colors.LIGHT_GRAY5;
}

export function getBorderStyle(state: { theme: any; }) {

	if (!state) return "1px solid " + Colors.LIGHT_GRAY1;

	return "1px solid " + (state.theme == 'bp3-dark' ? Colors.DARK_GRAY1 : Colors.LIGHT_GRAY1)
}

export function getBorderRadius() {
	return "3px";
}

export function getColor(state: { theme: any; }) {

	if (!state) return Colors.LIGHT_GRAY1;

	return state.theme == 'bp3-dark' ? Colors.DARK_GRAY5 : Colors.LIGHT_GRAY1;
}
