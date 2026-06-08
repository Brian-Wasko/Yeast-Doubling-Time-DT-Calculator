
import React from 'react';
import { WellData } from '../types';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Scatter,
  ReferenceArea,
  ReferenceDot,
  Brush
} from 'recharts';
import { AlertTriangle } from 'lucide-react';

interface Props {
  wellData: WellData | null;
  lowOD: number;
  highOD: number;
}

const GrowthChart: React.FC<Props> = ({ wellData, lowOD, highOD }) => {
  if (!wellData) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
        <p>Select a well from the table to view its growth curve.</p>
      </div>
    );
  }

  // Format data for Recharts
  const chartData = wellData.dataPoints.map(p => ({
    timeMin: p.timeValue,
    od: p.od,
    isIncluded: p.included
  }));

  // Calculate Y-axis domain to look nice
  const maxOD = wellData.rawValues.length > 0 ? Math.max(...wellData.rawValues) * 1.1 : 1;

  // Determine if we should show the global inflection point
  // Show it if it exists AND (range inflection doesn't exist OR it's at a different time)
  const showGlobalInflection = wellData.globalInflectionPoint && (
    !wellData.inflectionPoint || 
    wellData.globalInflectionPoint.timeValue !== wellData.inflectionPoint.timeValue
  );

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 h-full flex flex-col">
      <div className="mb-4">
        <div className="flex justify-between items-start">
            <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-800 flex items-baseline gap-2">
                <span>Growth Curve:</span>
                <span className="text-science-600">{wellData.label}</span>
                {wellData.name && (
                    <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {wellData.name}
                    </span>
                )}
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-1 gap-x-4 text-sm text-slate-600 mt-2">
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase">DT (Interval)</span>
                        <span className="font-semibold text-slate-900">{wellData.doublingTimeMin?.toFixed(2) ?? 'N/A'} min</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase text-science-600">DT (Inflection)</span>
                        <span className="font-semibold text-science-700">{wellData.doublingTimeInflection?.toFixed(2) ?? 'N/A'} min</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase text-pink-500">DT (Global)</span>
                        <span className="font-semibold text-pink-600">{wellData.doublingTimeGlobal?.toFixed(2) ?? 'N/A'} min</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase">Lag Time</span>
                        <span className="font-semibold text-slate-900">{wellData.lagTime !== null ? wellData.lagTime.toFixed(1) + ' min' : 'N/A'}</span>
                    </div>
                     <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase">Min OD</span>
                        <span className="font-mono">{wellData.minOD.toFixed(3)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400 uppercase">Max OD</span>
                        <span className="font-mono">{wellData.maxOD.toFixed(3)}</span>
                    </div>
                     <div className="flex flex-col col-span-2">
                        <span className="text-xs text-slate-400 uppercase">Calc Range</span>
                        <span className="font-mono">{lowOD} - {highOD} OD</span>
                    </div>
                </div>
            </div>
            {wellData.isHighInitialOD && (
                <div className="ml-4 bg-red-50 text-red-700 px-3 py-2 rounded-md border border-red-100 flex items-start gap-2 max-w-xs shrink-0">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <div className="text-xs">
                        <strong>Warning:</strong> Initial OD ({wellData.dataPoints[0]?.od}) is ≥ Lower Limit ({lowOD}). DT calculation may be inaccurate.
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="timeMin" 
              label={{ value: 'Time (min)', position: 'insideBottomRight', offset: -10 }} 
              tick={{fontSize: 12}}
              type="number"
            />
            <YAxis 
              label={{ 
                value: 'Optical Density (OD)', 
                angle: -90, 
                position: 'insideLeft',
                style: { textAnchor: 'middle' },
                offset: 10
              }} 
              domain={[0, maxOD]}
              tick={{fontSize: 12}}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              itemStyle={{ fontSize: '13px' }}
              labelStyle={{ color: '#64748b', marginBottom: '4px' }}
              labelFormatter={(label) => `Time: ${label} min`}
            />
            <Legend verticalAlign="top" height={36}/>
            
            {/* Background highlight for OD range */}
            <ReferenceArea y1={lowOD} y2={highOD} fill="#0ea5e9" fillOpacity={0.1} label="Calc Range" />

            {/* Base line */}
            <Line 
              type="monotone" 
              dataKey="od" 
              stroke="#94a3b8" 
              dot={false} 
              strokeWidth={2}
              name="Raw Data"
            />

            {/* Global Inflection Point (Entire Curve) - Pink */}
            {showGlobalInflection && (
                 <ReferenceDot 
                    x={wellData.globalInflectionPoint!.timeValue} 
                    y={wellData.globalInflectionPoint!.od} 
                    r={5} 
                    fill="#ec4899" // Pink-500
                    stroke="white"
                    strokeWidth={2}
                    label={{ value: 'Global Infl.', position: 'bottom', fill: '#ec4899', fontSize: 10, fontWeight: 'bold' }}
                />
            )}

            {/* Range Inflection Point Indicator - Purple */}
            {wellData.inflectionPoint && (
                <ReferenceDot 
                    x={wellData.inflectionPoint.timeValue} 
                    y={wellData.inflectionPoint.od} 
                    r={6} 
                    fill="#9333ea" 
                    stroke="white"
                    strokeWidth={2}
                    label={{ value: 'Range Infl.', position: 'top', fill: '#9333ea', fontSize: 10, fontWeight: 'bold' }}
                />
            )}
            
            {/* Highlight points used in calculation (Blue) */}
             <Scatter 
              name="Interval Points" 
              data={chartData.filter(d => d.isIncluded)} 
              fill="#0ea5e9" 
              line={false}
              shape="circle"
              legendType="none" // Hide from legend to avoid clutter, user knows blue area
            />

            <Brush 
                dataKey="timeMin" 
                height={30} 
                stroke="#cbd5e1"
                fill="#f8fafc"
                tickFormatter={(value) => `${value}m`}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GrowthChart;
