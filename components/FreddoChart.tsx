import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';
import { FreddoYearData } from '../types';

interface FreddoChartProps {
  data: FreddoYearData[];
  onYearSelect: (yearData: FreddoYearData) => void;
  selectedYear: number;
}

const FreddoChart: React.FC<FreddoChartProps> = ({ data, onYearSelect, selectedYear }) => {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-cadbury rounded-lg shadow-xl z-50">
          <p className="font-display font-bold text-cadbury text-lg">{label}</p>
          <p className="text-freddo-green font-bold text-xl">{item.price}p</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-cadbury mb-6 pl-2 border-l-4 border-cadbury">Price History (1995 - 2025)</h2>
      
      <div className="w-full">
        <div className="h-[400px] md:h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
              onClick={(state) => {
                if (state && state.activePayload && state.activePayload.length > 0) {
                    onYearSelect(state.activePayload[0].payload);
                }
              }}
              onMouseMove={(state) => {
                  if (state && state.activeTooltipIndex !== undefined) {
                      setHoveredYear(data[state.activeTooltipIndex]?.year ?? null);
                  } else {
                      setHoveredYear(null);
                  }
              }}
              cursor="pointer"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="year" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#666', fontSize: 12 }} 
                dy={10}
                interval={window.innerWidth < 768 ? 4 : 2}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#666', fontSize: 12 }}
                unit="p"
                domain={[0, 40]}
                ticks={[0, 10, 20, 30, 40]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(51, 0, 114, 0.05)' }} />
              <ReferenceLine y={10} stroke="#e0e0e0" strokeDasharray="3 3" />
              <Bar 
                dataKey="price" 
                radius={[4, 4, 0, 0]}
                animationDuration={1000}
              >
                {data.map((entry, index) => {
                    const isSelected = entry.year === selectedYear;
                    const isHovered = entry.year === hoveredYear;
                    
                    // Color Logic - Purple Hues
                    let fill;
                    if (entry.isGoldenEra) {
                        fill = '#D8B4FE'; // Light Purple
                    } else {
                        fill = '#8B5CF6'; // Vivid Purple
                    }

                    // Highlighting Logic
                    if (isSelected) fill = '#330072'; // Selected = Cadbury Purple
                    else if (isHovered) fill = '#6D28D9'; // Hover = Deep Purple

                    return <Cell key={`cell-${index}`} fill={fill} cursor="pointer" transition="all" />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex justify-center gap-6 mt-6 text-xs text-gray-500 flex-wrap">
         <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#D8B4FE] rounded-sm"></div>
            <span>The Golden Era (10p)</span>
         </div>
         <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#8B5CF6] rounded-sm"></div>
            <span>Inflation Era</span>
         </div>
         <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-cadbury rounded-sm"></div>
            <span>Selected</span>
         </div>
      </div>
    </div>
  );
};

export default FreddoChart;