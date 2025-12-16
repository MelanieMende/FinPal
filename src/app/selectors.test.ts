import { Colors } from '@blueprintjs/core'
import * as selector from './selectors'

describe('selectors', () => {

  describe('get_button_text_color(theme: string)', () => {

		it('should return Colors.TURQUOISE5 if theme == \'bp5-dark\'', () => {
			const theme = 'bp5-dark'
			expect(selector.get_button_text_color(theme)).toEqual(Colors.TURQUOISE5)
		})

    it('should return Colors.TURQUOISE3 if theme != \'bp5-dark\'', () => {
			const theme = 'not-dark'
			expect(selector.get_button_text_color(theme)).toEqual(Colors.TURQUOISE3)
		})

	})
})