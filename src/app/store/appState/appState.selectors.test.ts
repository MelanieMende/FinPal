import * as selectors from './appState.selectors'

import {
	Colors,
} from '@blueprintjs/core';

describe('AppState selectors', () => {

	describe('getBgColor()', () => {

		describe('state is not set', () => {

			it('should return "' + Colors.LIGHT_GRAY5 + '"', () => {

				expect(selectors.getBgColor()).toEqual(Colors.LIGHT_GRAY5)
			})
		})

		describe('state is set', () => {

			describe('theme is set to "bp3-dark"', () => {

				const state = {
					theme: 'bp3-dark'
				}

				it('should return "' + Colors.DARK_GRAY3 + '" if type is not set', () => {

					expect(selectors.getBgColor(state)).toEqual(Colors.DARK_GRAY3)
				})

				it('should return "' + Colors.DARK_GRAY3 + '" if type is set to "dark"', () => {

					expect(selectors.getBgColor(state, "dark")).toEqual(Colors.DARK_GRAY3)
				})
			})

			describe('theme is not set to "bp3-dark"', () => {

				const state = {
					theme: ''
				}

				it('should return "' + Colors.LIGHT_GRAY5 + '" if type is not set', () => {

					expect(selectors.getBgColor(state)).toEqual(Colors.LIGHT_GRAY5)
				})

				it('should return "' + Colors.LIGHT_GRAY5 + '" if type is set to "dark"', () => {

					expect(selectors.getBgColor(state, "dark")).toEqual(Colors.LIGHT_GRAY5)
				})
			})
		})

	})

	describe('getBorderStyle()', () => {

		it('should return "1px solid #1C2127" if theme is set to "bp3-dark"', () => {

			const state = {
				theme: 'bp3-dark'
			}

			expect(selectors.getBorderStyle(state)).toEqual("1px solid #1C2127")
		})

		it('should return "1px solid #D3D8DE" if theme is set to "bp3-body"', () => {

			const state = {
				theme: 'bp3-body'
			}

			expect(selectors.getBorderStyle(state)).toEqual("1px solid #D3D8DE")
		})

	})

	describe('getColor()', () => {

		it('should return "#404854" if theme is set to "bp3-dark"', () => {

			const state = {
				theme: 'bp3-dark'
			}

			expect(selectors.getColor(state)).toEqual("#404854")
		})

		it('should return "#D3D8DE" if theme is set to "bp3-body"', () => {

			const state = {
				theme: 'bp3-body'
			}

			expect(selectors.getColor(state)).toEqual("#D3D8DE")
		})

	})

})
