export interface HousePriceIndexObservation {
	period: string;
	value: number;
}

export const germanHousePriceIndexSource = 'BIS-Häuserpreisindex Deutschland (nominal, Index 2010=100)';
export const germanHousePriceIndexUrl = 'https://stats.bis.org/api/v1/data/WS_SPP/Q.DE.N.628';

function parseAttributes(markup: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const attributePattern = /([A-Z_]+)="([^"]*)"/g;
	let match: RegExpExecArray | null;
	while ((match = attributePattern.exec(markup)) !== null) {
		attributes[match[1]] = match[2];
	}
	return attributes;
}

function periodOrder(period: string): number | null {
	const match = /^(\d{4})-Q([1-4])$/.exec(period);
	return match ? Number(match[1]) * 4 + Number(match[2]) : null;
}

export function parseGermanHousePriceIndex(xml: string): HousePriceIndexObservation[] {
	const observations: HousePriceIndexObservation[] = [];
	const seriesPattern = /<Series\b([^>]*)>([\s\S]*?)<\/Series>/g;
	let seriesMatch: RegExpExecArray | null;

	while ((seriesMatch = seriesPattern.exec(xml)) !== null) {
		const series = parseAttributes(seriesMatch[1]);
		if (series.FREQ !== 'Q' || series.REF_AREA !== 'DE' || series.VALUE !== 'N' || series.UNIT_MEASURE !== '628') continue;

		const observationPattern = /<Obs\b([^>]*)\/?>/g;
		let observationMatch: RegExpExecArray | null;
		while ((observationMatch = observationPattern.exec(seriesMatch[2])) !== null) {
			const observation = parseAttributes(observationMatch[1]);
			const value = Number(observation.OBS_VALUE);
			if (periodOrder(observation.TIME_PERIOD) !== null && Number.isFinite(value) && value > 0) {
				observations.push({ period: observation.TIME_PERIOD, value });
			}
		}
	}

	observations.sort((a, b) => (periodOrder(a.period) ?? 0) - (periodOrder(b.period) ?? 0));
	if (observations.length === 0) throw new Error('Der deutsche BIS-Häuserpreisindex ist nicht verfügbar.');
	return observations;
}

export async function fetchGermanHousePriceIndex(fetcher: typeof fetch = fetch): Promise<HousePriceIndexObservation[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const response = await fetcher(germanHousePriceIndexUrl, {
			headers: { Accept: 'text/csv' },
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`Der BIS-Häuserpreisindex konnte nicht geladen werden (HTTP ${response.status}).`);
		return parseGermanHousePriceIndex(await response.text());
	} finally {
		clearTimeout(timeout);
	}
}

export function estimateGermanPropertyMarketValue(
	purchasePrice: number,
	purchaseDate: string,
	observations: HousePriceIndexObservation[]
): { value: number; period: string } {
	if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
		throw new Error('Für die Schätzung wird ein Kaufpreis größer als 0 benötigt.');
	}

	const parsedPurchaseDate = new Date(`${purchaseDate}T00:00:00.000Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || Number.isNaN(parsedPurchaseDate.getTime())
		|| parsedPurchaseDate.toISOString().slice(0, 10) !== purchaseDate) {
		throw new Error('Für die Schätzung wird ein gültiges Kaufdatum benötigt.');
	}

	const quarter = Math.floor(parsedPurchaseDate.getUTCMonth() / 3) + 1;
	const purchasePeriod = `${parsedPurchaseDate.getUTCFullYear()}-Q${quarter}`;
	const purchaseIndex = observations.find(observation => observation.period === purchasePeriod);
	const latestIndex = observations.reduce<HousePriceIndexObservation | undefined>(
		(latest, observation) => !latest || (periodOrder(observation.period) ?? 0) > (periodOrder(latest.period) ?? 0)
			? observation
			: latest,
		undefined
	);
	if (!purchaseIndex || !latestIndex) {
		throw new Error('Für das Kaufdatum liegt kein passender Indexwert vor.');
	}

	const value = Math.round(purchasePrice * latestIndex.value / purchaseIndex.value * 100) / 100;
	if (!Number.isFinite(value) || value <= 0) throw new Error('Der berechnete Immobilienwert ist ungültig.');
	return { value, period: latestIndex.period };
}

export function formatHousePriceIndexPeriod(period: string): string {
	const match = /^(\d{4})-Q([1-4])$/.exec(period);
	return match ? `Q${match[2]} ${match[1]}` : period;
}
