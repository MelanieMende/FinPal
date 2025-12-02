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
			'* [Code of Conduct](#code-of-conduct)',
			'* [License](#license)',
		];
		tocEntries.forEach((entry) => {
			expect(readmeContent).toContain(entry);
		});
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