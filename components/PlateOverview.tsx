import React from 'react';
import { WellData } from '../types';

interface Props {
  results: WellData[];
  onSelectWell: (well: WellData) => void;
  selectedWellLabel?: string;
  lowOD: number;
  highOD: number;
}

const PlateOverview: React.FC<Props> = ({ results, onSelectWell, selectedWellLabel, lowOD, highOD }) => {
  if (results.length === 0) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-400 bg-white rounded-lg border border-slate-200 border-dashed">
        <p>Process a file to view the plate overview.</p>
      </div>
    );
  }

  // Helper to get global max OD for consistent Y-axis scaling across all sparklines
  const allMaxOD = Math.max(...results.map(w => Math.max(...w.rawValues)));
  const yMax = allMaxOD > 0 ? allMaxOD * 1.1 : 1;
  
  // Group wells by row (A, B, C...)
  const rows: Record<string, WellData[]> = {};
  // Initialize rows A-H for standard 96 well
  ['A','B','C','D','E','F','G','H'].forEach(r => { rows[r] = [] });

  // Distribute results
  results.forEach(w => {
      const rowChar = w.label.charAt(0).toUpperCase();
      if (!rows[rowChar]) rows[rowChar] = [];
      rows[rowChar].push(w);
  });

  // Sort columns 1-12
  Object.keys(rows).forEach(key => {
      rows[key].sort((a, b) => {
          const colA = parseInt(a.label.substring(1));
          const colB = parseInt(b.label.substring(1));
          return colA - colB;
      });
  });

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
      <div className="w-full">
        {/* Header Row (Column Numbers) */}
        <div className="flex mb-2">
            <div className="w-8 shrink-0"></div> {/* Row label spacer */}
            {Array.from({ length: 12 }, (_, i) => i + 1).map(num => (
                <div key={num} className="flex-1 text-center text-xs font-bold text-slate-500">
                    {num}
                </div>
            ))}
        </div>

        {/* Grid Rows */}
        {Object.entries(rows).map(([rowLabel, wells]) => {
            if (wells.length === 0) return null;
            
            // Create a sparse array for columns 1-12 in case some wells are missing
            const cols = Array(12).fill(null);
            wells.forEach(w => {
                const colIdx = parseInt(w.label.substring(1)) - 1;
                if (colIdx >= 0 && colIdx < 12) cols[colIdx] = w;
            });

            return (
                <div key={rowLabel} className="flex mb-2 h-16">
                    {/* Row Label */}
                    <div className="w-8 flex items-center justify-center font-bold text-slate-500 shrink-0">
                        {rowLabel}
                    </div>

                    {/* Columns */}
                    {cols.map((well: WellData | null, idx) => (
                        <div key={idx} className="flex-1 px-1 min-w-0">
                            {well ? (
                                <Sparkline 
                                    well={well} 
                                    yMax={yMax} 
                                    isSelected={well.label === selectedWellLabel}
                                    onClick={() => onSelectWell(well)}
                                    lowOD={lowOD}
                                    highOD={highOD}
                                />
                            ) : (
                                <div className="w-full h-full bg-slate-50 rounded border border-slate-100 opacity-50"></div>
                            )}
                        </div>
                    ))}
                </div>
            );
        })}
      </div>
    </div>
  );
};

const Sparkline: React.FC<{
    well: WellData; 
    yMax: number; 
    isSelected: boolean; 
    onClick: () => void;
    lowOD: number;
    highOD: number;
}> = ({ well, yMax, isSelected, onClick, lowOD, highOD }) => {
    // Generate SVG path
    const width = 100;
    const height = 100; // coordinate space
    const xMax = well.dataPoints.length > 0 ? well.dataPoints[well.dataPoints.length - 1].timeValue : 1;
    
    // Polyline points
    const points = well.dataPoints.map(p => {
        const x = (p.timeValue / xMax) * width;
        const y = height - ((p.od / yMax) * height);
        return `${x},${y}`;
    }).join(' ');

    // Calculate Y positions for reference lines (low/high OD)
    const yLow = height - ((lowOD / yMax) * height);
    const yHigh = height - ((highOD / yMax) * height);

    return (
        <div 
            onClick={onClick}
            className={`
                w-full h-full rounded border relative cursor-pointer overflow-hidden group
                ${isSelected 
                    ? 'border-science-500 bg-science-50 ring-2 ring-science-200' 
                    : 'border-slate-200 bg-white hover:border-science-300'
                }
            `}
            title={`${well.label} ${well.name ? `- ${well.name}` : ''}\nDT: ${well.doublingTimeMin?.toFixed(1) ?? 'N/A'}`}
        >
            <div className="absolute top-0.5 left-1 text-[10px] font-bold text-slate-500 group-hover:text-science-600">
                {well.label}
            </div>
            
            {well.isHighInitialOD && (
                 <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" title="High Initial OD" />
            )}

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full p-1" preserveAspectRatio="none">
                {/* Reference Range Band */}
                <rect 
                    x="0" 
                    y={Math.min(yHigh, yLow)} 
                    width={width} 
                    height={Math.abs(yHigh - yLow)} 
                    fill="#0ea5e9" 
                    fillOpacity="0.15" 
                />
                
                {/* Data Line */}
                <polyline 
                    points={points} 
                    fill="none" 
                    stroke={isSelected ? '#0284c7' : '#94a3b8'} 
                    strokeWidth="3" 
                />
            </svg>
        </div>
    );
}

export default PlateOverview;