import React, { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from './../../../hooks'
import { Card, H3, H5, Icon } from '@blueprintjs/core';

import DividendList from './components/DividendList';
import DividendCalendar from './components/DividendCalendar';
import UpcomingDividends from './components/UpcomingDividends';
import DividendBarChart from './components/DividendBarChart';

export default function DividendsRoute() {
	const dividends = useAppSelector(state => state.dividends) || [];
	const currentYear = new Date().getFullYear();
	const availableYears = useMemo(() => [...new Set(dividends
		.map(dividend => new Date(dividend.date).getFullYear())
		.filter(year => Number.isFinite(year))
	)].sort((a, b) => b - a), [dividends]);
	const [selectedYear, setSelectedYear] = useState(currentYear);

	useEffect(() => {
		if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
			setSelectedYear(availableYears[0]);
		}
	}, [availableYears, selectedYear]);

	// Calculate Monthly Data for Bar Chart
	const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	const monthlyData = monthNames.map((name, index) => {
		const income = dividends
			.filter(d => {
				const date = new Date(d.date);
				return date.getFullYear() === selectedYear && date.getMonth() === index;
			})
			.reduce((acc, d) => acc + (d.income || 0), 0);
		return { month: name, income: Math.round(income * 100) / 100 };
	});

	// KPI Calculations
	const selectedYearIncome = dividends
		.filter(d => new Date(d.date).getFullYear() === selectedYear)
		.reduce((acc, d) => acc + (d.income || 0), 0);
	
	const elapsedMonths = selectedYear === currentYear ? new Date().getMonth() + 1 : 12;
	const avgMonthlyIncome = selectedYearIncome / elapsedMonths;

	return (
		<div id="DividendsRoute" data-testid="DividendsRoute" className="w-full p-4 animate-in fade-in duration-500">
			{/* Summary Header */}
			<div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
				<div>
					<H3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-500">
						Dividend Income
					</H3>
					<p className="text-gray-400 font-medium">Tracking your passive income journey.</p>
				</div>
				<div className="flex gap-4">
					<Card className="glass-card py-2 px-4 flex items-center gap-3">
						<div className="p-2 bg-emerald-500/10 rounded-lg">
							<Icon icon="trending-up" className="text-emerald-500" size={16} />
						</div>
						<div>
							<div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
								{selectedYear === currentYear ? 'YTD Income' : `${selectedYear} Income`}
							</div>
							<div className="text-lg font-bold text-white">{selectedYearIncome.toFixed(2)} €</div>
						</div>
					</Card>
					<Card className="glass-card py-2 px-4 flex items-center gap-3">
						<div className="p-2 bg-blue-500/10 rounded-lg">
							<Icon icon="chart" className="text-blue-500" size={16} />
						</div>
						<div>
							<div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Monthly Avg</div>
							<div className="text-lg font-bold text-white">{avgMonthlyIncome.toFixed(2)} €</div>
						</div>
					</Card>
				</div>
			</div>

			{/* Main Chart Section */}
			<Card className="glass-card mb-8 p-6 h-[400px] flex flex-col">
				<div className="flex justify-between items-center mb-6">
					<div className="flex items-center gap-3">
						<H5 className="text-gray-400 uppercase text-xs font-bold tracking-widest m-0">Monthly Breakdown</H5>
						{availableYears.length > 0 && (
							<select
								aria-label="Jahr für Monthly Breakdown"
								value={selectedYear}
								onChange={event => setSelectedYear(Number(event.target.value))}
								className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
							>
								{availableYears.map(year => <option key={year} value={year}>{year}</option>)}
							</select>
						)}
					</div>
					<div className="text-sm font-semibold text-emerald-400">Total: {selectedYearIncome.toFixed(2)} €</div>
				</div>
				<div className="flex-grow min-h-0">
					<DividendBarChart data={monthlyData} />
				</div>
			</Card>

			{/* Grid Layout for Lists and Calendar */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
				<div className="space-y-8">
					<Card className="glass-card p-0 overflow-hidden">
						<div className="p-4 border-b border-white/5 bg-white/5">
							<H5 className="m-0 text-sm font-bold uppercase tracking-wider text-gray-300">Upcoming Payments</H5>
						</div>
						<div className="p-4">
							<UpcomingDividends />
						</div>
					</Card>

					<Card className="glass-card p-0 overflow-hidden">
						<div className="p-4 border-b border-white/5 bg-white/5">
							<H5 className="m-0 text-sm font-bold uppercase tracking-wider text-gray-300">Annual History</H5>
						</div>
						<div className="p-4 overflow-x-auto">
							<DividendCalendar />
						</div>
					</Card>
				</div>

				<Card className="glass-card p-0 overflow-hidden">
					<div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
						<H5 className="m-0 text-sm font-bold uppercase tracking-wider text-gray-300">Transaction History</H5>
						<Icon icon="history" className="text-gray-500" />
					</div>
					<div className="p-0">
						<DividendList />
					</div>
				</Card>
			</div>
		</div>
	);
}
