import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DividendBarChartProps {
	data: {
		month: string;
		income: number;
	}[];
}

const COLORS = ['#3b82f6', '#60a5fa', '#3b82f6', '#2563eb'];

export default function DividendBarChart({ data }: DividendBarChartProps) {
	return (
		<div className="w-full h-full min-h-[300px] min-w-0">
			<ResponsiveContainer width="99%" height="99%">
				<BarChart
					data={data}
					margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
				>
					<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
					<XAxis 
						dataKey="month" 
						axisLine={false} 
						tickLine={false} 
						tick={{ fill: '#94a3b8', fontSize: 12 }}
					/>
					<YAxis 
						axisLine={false} 
						tickLine={false} 
						tick={{ fill: '#94a3b8', fontSize: 12 }}
						tickFormatter={(value) => `${value} €`}
					/>
					<Tooltip
						cursor={{ fill: 'rgba(255,255,255,0.05)' }}
						contentStyle={{ 
							backgroundColor: '#1b1f24', 
							border: '1px solid rgba(255,255,255,0.1)',
							borderRadius: '12px',
							color: '#fff',
							fontSize: '14px'
						}}
						itemStyle={{ color: '#fff' }}
						formatter={(value: number) => [`${value.toFixed(2)} €`, 'Income']}
					/>
					<Bar 
						dataKey="income" 
						radius={[6, 6, 0, 0]}
						barSize={40}
					>
						{data.map((entry, index) => (
							<Cell key={`cell-${index}`} fill={entry.income > 0 ? '#3b82f6' : '#1e293b'} fillOpacity={0.8} />
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
