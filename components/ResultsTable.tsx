
import React from 'react';
import { WellData } from '../types';
import { Download, AlertCircle, Flag } from 'lucide-react';

interface Props {
  data: WellData[];
  onSelectWell: (well: WellData) => void;
  selectedWellLabel?: string;
  selectedStatsWells: Set<string>;
  onToggleStatsWell: (label: string) => void;
  onToggleAllStats?: (selectAll: boolean) => void;
  autoGroupingEnabled?: boolean;
  onToggleAutoGrouping?: (enabled: boolean) => void;
}

const ResultsTable: React.FC<Props> = ({ 
    data, 
    onSelectWell, 
    selectedWellLabel,
    selectedStatsWells,
    onToggleStatsWell,
    onToggleAllStats,
    autoGroupingEnabled = false,
    onToggleAutoGrouping
}) => {
  
  const downloadCSV = () => {
    if (data.length === 0) return;
    
    // Removed R-Squared, Renamed DT Avg -> DT Interval
    const headers = [
      'Label', 
      'Condition', 
      'DT Interval (min)', 
      'DT Inflection (min)', 
      'DT Global (min)', 
      'Lag Time (min)', 
      'Min OD', 
      'Max OD', 
      'Notes'
    ];
    
    const rows = data.map(w => [
      w.label,
      w.name ? `"${w.name.replace(/"/g, '""')}"` : '',
      w.doublingTimeMin ? w.doublingTimeMin.toFixed(4) : 'NaN',
      w.doublingTimeInflection ? w.doublingTimeInflection.toFixed(4) : 'NaN',
      w.doublingTimeGlobal ? w.doublingTimeGlobal.toFixed(4) : 'NaN',
      w.lagTime !== null ? w.lagTime.toFixed(4) : 'NaN',
      w.minOD.toFixed(4),
      w.maxOD.toFixed(4),
      w.isHighInitialOD ? 'Initial OD >= Low Limit' : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'doubling_times_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>, label: string) => {
    e.stopPropagation(); // Prevent row selection when clicking checkbox
    onToggleStatsWell(label);
  };

  const allSelected = data.length > 0 && selectedStatsWells.size === data.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col h-full max-h-[600px]">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
        <h2 className="text-lg font-semibold text-slate-800">Results ({data.length})</h2>
        <div className="flex items-center gap-4">
            {onToggleAllStats && (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                    <input 
                        type="checkbox" 
                        checked={allSelected} 
                        onChange={(e) => onToggleAllStats(e.target.checked)}
                        className="rounded border-slate-300 text-science-600 focus:ring-science-500 h-4 w-4"
                    />
                    Select All
                </label>
            )}
            {onToggleAutoGrouping && (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none" title="Automatically select/deselect all wells with the same name">
                    <input 
                        type="checkbox" 
                        checked={autoGroupingEnabled} 
                        onChange={(e) => onToggleAutoGrouping(e.target.checked)}
                        className="rounded border-slate-300 text-science-600 focus:ring-science-500 h-4 w-4"
                    />
                    Auto-select Group
                </label>
            )}
            <button 
            onClick={downloadCSV}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-science-600 hover:bg-science-700 rounded transition-colors"
            >
            <Download size={16} />
            Export CSV
            </button>
        </div>
      </div>
      
      <div className="overflow-auto flex-1 p-0">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 w-10">Select</th>
              <th className="px-4 py-3">Well</th>
              <th className="px-4 py-3">Condition</th>
              <th className="px-4 py-3" title="Doubling Time calculated over the specified OD interval">DT Interval</th>
              <th className="px-4 py-3 text-science-700" title="Doubling Time at steepest slope within range">DT Inflection</th>
              <th className="px-4 py-3 text-pink-600" title="Doubling Time at steepest slope of entire curve">DT Global</th>
              <th className="px-4 py-3" title="Calculated Lag Time based on Global Inflection">Lag Time</th>
              <th className="px-4 py-3">Min OD</th>
              <th className="px-4 py-3">Max OD</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((well) => {
              const hasData = well.doublingTimeMin !== null;
              const isSelected = well.label === selectedWellLabel;
              
              return (
                <tr 
                  key={well.label}
                  onClick={() => onSelectWell(well)}
                  className={`
                    cursor-pointer transition-colors
                    ${isSelected ? 'bg-science-100 hover:bg-science-100' : 'hover:bg-slate-50'}
                    ${well.isHighInitialOD ? 'bg-red-50/50' : ''}
                  `}
                >
                  <td className="px-4 py-3 text-center">
                    <input 
                        type="checkbox"
                        checked={selectedStatsWells.has(well.label)}
                        onChange={(e) => handleCheckboxChange(e, well.label)}
                        className="rounded border-slate-300 text-science-600 focus:ring-science-500 h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{well.label}</td>
                  <td className="px-4 py-3 text-slate-600 font-medium max-w-[150px] truncate" title={well.name}>
                    {well.name ? (
                      <span className="text-slate-800">{well.name}</span>
                    ) : (
                      <span className="text-slate-300 italic">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    <div className="flex items-center gap-2">
                        <span>{hasData ? well.doublingTimeMin?.toFixed(2) : '-'}</span>
                        {well.isHighInitialOD && (
                            <span title="Warning: Initial OD is higher than Lower Limit">
                                <Flag size={14} className="text-red-500" fill="currentColor" />
                            </span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-science-700 font-medium">
                     {well.doublingTimeInflection ? well.doublingTimeInflection.toFixed(2) : '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-pink-600 font-medium">
                     {well.doublingTimeGlobal ? well.doublingTimeGlobal.toFixed(2) : '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                     {well.lagTime !== null ? well.lagTime.toFixed(1) : '-'}
                  </td>
                   <td className="px-4 py-3 font-mono text-slate-500">
                     {well.minOD.toFixed(3)}
                  </td>
                   <td className="px-4 py-3 font-mono text-slate-500">
                     {well.maxOD.toFixed(3)}
                  </td>
                  <td className="px-4 py-3">
                    {hasData ? (
                        well.isHighInitialOD ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">
                                High Start
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                OK
                            </span>
                        )
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <AlertCircle size={12} />
                        Invalid Range
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.length === 0 && (
            <div className="p-8 text-center text-slate-400">
                No results calculated. Upload a file to begin.
            </div>
        )}
      </div>
    </div>
  );
};

export default ResultsTable;
