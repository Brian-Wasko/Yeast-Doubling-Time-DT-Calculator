
import React, { useMemo } from 'react';
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

  // Calculate grid dimensions dynamically
  const { rows, colCount, rowLabels } = useMemo(() => {
    let maxCol = 12; // Default min 12
    let maxRowIdx = 7; // Default min 8 rows (Index 7 is 'H')

    // Find extent of data
    results.forEach(w => {
        const rowMatch = w.label.match(/^[A-Za-z]+/);
        const colMatch = w.label.match(/\d+$/);
        
        if (rowMatch && colMatch) {
            const rowChar = rowMatch[0].toUpperCase();
            // Simple char code calc for single letters, adequate for plates < 26 rows
            const rIdx = rowChar.charCodeAt(0) - 65; 
            const cIdx = parseInt(colMatch[0]);

            if (rIdx > maxRowIdx) maxRowIdx = rIdx;
            if (cIdx > maxCol) maxCol = cIdx;
        }
    });

    const finalColCount = maxCol;
    
    // Generate Row Labels (A, B, C...)
    const finalRowLabels: string[] = [];
    for(let i=0; i<=maxRowIdx; i++) {
        finalRowLabels.push(String.fromCharCode(65 + i));
    }

    // Organize data into rows
    const rowsMap: Record<string, WellData[]> = {};
    finalRowLabels.forEach(r => { rowsMap[r] = [] });

    results.forEach(w => {
        const rowMatch = w.label.match(/^[A-Za-z]+/);
        if (rowMatch) {
            const r = rowMatch[0].toUpperCase();
            if (rowsMap[r]) rowsMap[r].push(w);
        }
    });

    // Sort wells within rows by column index
    Object.values(rowsMap).forEach(list => {
        list.sort((a, b) => {
             const colA = parseInt(a.label.match(/\d+$/)?.[0] || '0');
             const colB = parseInt(b.label.match(/\d+$/)?.[0] || '0');
             return colA - colB;
        });
    });

    return { rows: rowsMap, colCount: finalColCount, rowLabels: finalRowLabels };
  }, [results]);


  // Helper to get global max OD for consistent Y-axis scaling
  const allMaxOD = Math.max(...results.map(w => Math.max(...w.rawValues)));
  const yMax = allMaxOD > 0 ? allMaxOD * 1.1 : 1;
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
      <div className="min-w-fit">
        {/* Header Row (Column Numbers) */}
        <div className="flex mb-2">
            <div className="w-8 shrink-0"></div> {/* Row label spacer */}
            {Array.from({ length: colCount }, (_, i) => i + 1).map(num => (
                <div key={num} className="flex-1 min-w-[32px] text-center text-xs font-bold text-slate-500">
                    {num}
                </div>
            ))}
        </div>

        {/* Grid Rows */}
        {rowLabels.map((rowLabel) => {
            const wells = rows[rowLabel] || [];
            
            // Create a sparse array for columns
            const cols = Array(colCount).fill(null);
            wells.forEach(w => {
                const colMatch = w.label.match(/\d+$/);
                if (colMatch) {
                    const colIdx = parseInt(colMatch[0]) - 1;
                    if (colIdx >= 0 && colIdx < colCount) cols[colIdx] = w;
                }
            });

            return (
                <div key={rowLabel} className="flex mb-2 h-16">
                    {/* Row Label */}
                    <div className="w-8 flex items-center justify-center font-bold text-slate-500 shrink-0">
                        {rowLabel}
                    </div>

                    {/* Columns */}
                    {cols.map((well: WellData | null, idx) => (
                        <div key={idx} className="flex-1 px-0.5 min-w-[32px]">
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
            <div className="absolute top-0.5 left-0.5 text-[8px] sm:text-[10px] font-bold text-slate-500 group-hover:text-science-600 leading-none">
                {well.label}
            </div>
            
            {well.isHighInitialOD && (
                 <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" title="High Initial OD" />
            )}

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full p-0.5" preserveAspectRatio="none">
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
                    strokeWidth="4" 
                />
            </svg>
        </div>
    );
}

export default PlateOverview;
