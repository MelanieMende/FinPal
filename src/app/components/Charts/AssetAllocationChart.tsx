import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface AssetAllocationChartProps {
	data: {
		name: string;
		value: number;
	}[];
}

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

export default function AssetAllocationChart({ data }: AssetAllocationChartProps) {
	return (
		<div className="w-full h-full">
			<ResponsiveContainer width="100%" height="100%">
				<PieChart>
					<Pie
						data={data}
						cx="50%"
						cy="50%"
						innerRadius={60}
						outerRadius={80}
						paddingAngle={5}
						dataKey="value"
						stroke="none"
					>
						{data.map((entry, index) => (
							<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
						))}
					</Pie>
					<Tooltip 
						contentStyle={{ 
							backgroundColor: '#1b1f24', 
							border: '1px solid rgba(255,255,255,0.1)',
							borderRadius: '8px',
							color: '#fff'
						}}
						itemStyle={{ color: '#fff' }}
						formatter={(value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)}
					/>
					<Legend verticalAlign="bottom" height={36} iconType="circle" />
				</PieChart>
			</ResponsiveContainer>
		</div>
	);
}
