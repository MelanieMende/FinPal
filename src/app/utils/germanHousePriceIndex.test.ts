import {
	estimateGermanPropertyMarketValue,
	formatHousePriceIndexPeriod,
	parseGermanHousePriceIndex,
} from './germanHousePriceIndex';

describe('German house price index', () => {
	it('selects the nominal German index series and parses quarterly values', () => {
		const xml = `<Data><Series FREQ="Q" REF_AREA="DE" VALUE="N" UNIT_MEASURE="628">
			<Obs TIME_PERIOD="2013-Q2" OBS_VALUE="108.684"/>
			<Obs TIME_PERIOD="2026-Q2" OBS_VALUE="180.1253"/>
		</Series><Series FREQ="Q" REF_AREA="DE" VALUE="N" UNIT_MEASURE="771">
			<Obs TIME_PERIOD="2026-Q2" OBS_VALUE="0.6"/>
		</Series></Data>`;

		expect(parseGermanHousePriceIndex(xml)).toEqual([
			{ period: '2013-Q2', value: 108.684 },
			{ period: '2026-Q2', value: 180.1253 },
		]);
	});

	it('adjusts the purchase price by the index ratio from the purchase quarter to the latest quarter', () => {
		const estimate = estimateGermanPropertyMarketValue(200000, '2013-06-11', [
			{ period: '2013-Q2', value: 108.684 },
			{ period: '2026-Q2', value: 180.1253 },
		]);

		expect(estimate.period).toBe('2026-Q2');
		expect(estimate.value).toBe(331466.09);
		expect(formatHousePriceIndexPeriod(estimate.period)).toBe('Q2 2026');
	});

	it('rejects invalid dates and missing purchase-quarter data', () => {
		expect(() => estimateGermanPropertyMarketValue(200000, '2013-02-30', [])).toThrow('gültiges Kaufdatum');
		expect(() => estimateGermanPropertyMarketValue(200000, '2013-06-11', [])).toThrow('kein passender Indexwert');
	});
});
