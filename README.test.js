// test_README.md

const fs = require('fs');
const path = require('path');

describe('README.md Tests', () => {
	let readmeContent;

	beforeAll(() => {
		const readmePath = path.join(__dirname, 'README.md');
		readmeContent = fs.readFileSync(readmePath, 'utf-8');
	});

	test('should contain required sections', () => {
		const requiredSections = [
			'## FinPal',
			'### Table of contents',
			'### Install',
			'### Usage',
			'### Analyseablauf',
			'### Code of Conduct',
			'### License',
		];
		requiredSections.forEach((section) => {
			expect(readmeContent).toContain(section);
		});
	});

	test('should have valid table of contents', () => {
		const tocEntries = [
			'* [Install](#install)',
			'* [Usage](#usage)',
			'* [Analyseablauf](#analyseablauf)',
			'* [Code of Conduct](#code-of-conduct)',
			'* [License](#license)',
		];
		tocEntries.forEach((entry) => {
			expect(readmeContent).toContain(entry);
		});
	});

	test('should embed the maintained analysis flow diagram with current blocker semantics', () => {
		expect(readmeContent).toContain('![FinPal Analyseablauf](docs/analysis-flow.svg)');
		const diagramPath = path.join(__dirname, 'docs', 'analysis-flow.svg');
		const diagram = fs.readFileSync(diagramPath, 'utf-8');
		expect(diagram).toContain('Kein automatischer Blocker');
		expect(diagram).toContain('Konkreter Hinderungsgrund?');
		expect(diagram).toContain('Kaufen · Halten · Verkaufen');
		expect(diagram).toContain('Gehaltene Assets nacheinander');
		expect(diagram).toContain('Forecasts parallel laden');
		expect(diagram).toContain('Primärberichte abgleichen');
		expect(diagram).toContain('Unverändert: Cache');
	});

	test('should contain valid commands under Install', () => {
		const installCommands = ['git clone https://github.com/MelanieMende/finpal.git', 'npm install', 'yarn install'];
		installCommands.forEach((command) => {
			expect(readmeContent).toContain(command);
		});
	});

	test('should contain valid commands under Usage', () => {
		const usageCommands = [
			'npm run start',
			'npm run package',
			'npm run make',
		];
		usageCommands.forEach((command) => {
			expect(readmeContent).toContain(command);
		});
	});

	test('should have valid badge URLs', () => {
		const badgeUrls = [
			'http://opensource.org/licenses/MIT',
			'https://img.shields.io/npm/l/express.svg',
			'https://www.linkedin.com/in/melanie-mende/',
			'https://img.shields.io/badge/built%20by-LANILEY-brightgreen.svg?colorB=d30320',
			'https://github.com/laniley/finpal/workflows/build/badge.svg',
			'https://img.shields.io/github/release/laniley/finpal.svg',
		];
		badgeUrls.forEach((url) => {
			expect(readmeContent).toContain(url);
		});
	});

	test('should have a valid license section', () => {
		expect(readmeContent).toContain('MIT © [Melanie Mende](https://www.linkedin.com/in/melanie-mende/)');
	});
});
