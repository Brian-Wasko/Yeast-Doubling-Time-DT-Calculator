
import React, { useMemo, useRef, useState } from 'react';
import { WellData } from '../types';
import { groupWellsByName, performTTest, performANOVA } from '../utils/statsUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar, Cell } from 'recharts';
import { FlaskConical, Download, Camera, SlidersHorizontal, BookOpen, X } from 'lucide-react';
import html2canvas from 'html2canvas';

interface Props {
  selectedWells: WellData[];
}

type MetricType = 'doublingTimeMin' | 'doublingTimeInflection' | 'doublingTimeGlobal';

const StatsView: React.FC<Props> = ({ selectedWells }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('doublingTimeMin');
  const [showMethods, setShowMethods] = useState(false);
  
  const metricOptions: { value: MetricType; label: string }[] = [
    { value: 'doublingTimeMin', label: 'DT Interval' },
    { value: 'doublingTimeInflection', label: 'DT Inflection' },
    { value: 'doublingTimeGlobal', label: 'DT Global' }
  ];

  const { groups, statsResult } = useMemo(() => {
    // Pass the selected metric to the grouping function
    const rawGroups = groupWellsByName(selectedWells, selectedMetric);
    
    // Sorting logic to prioritize Controls/WT
    // Priority names: control, wildtype, wild-type, wt, by4741, by, by4742
    const controlKeywords = ['control', 'wildtype', 'wild-type', 'wt', 'by4741', 'by', 'by4742'];
    
    const isControl = (name: string) => {
        const n = name.toLowerCase().trim();
        return controlKeywords.some(k => n === k || n.startsWith(k + ' ') || n.startsWith(k + '_') || n.startsWith(k + '-'));
    };

    const sortedGroups = [...rawGroups].sort((a, b) => {
        const aCtrl = isControl(a.name);
        const bCtrl = isControl(b.name);
        
        // Control comes first
        if (aCtrl && !bCtrl) return -1;
        if (!aCtrl && bCtrl) return 1;
        
        // Otherwise alphabetical
        return a.name.localeCompare(b.name);
    });

    let res = null;
    if (sortedGroups.length === 2) {
      res = performTTest(sortedGroups[0], sortedGroups[1]);
    } else if (sortedGroups.length > 2) {
      res = performANOVA(sortedGroups);
    }

    return { groups: sortedGroups, statsResult: res };
  }, [selectedWells, selectedMetric]);

  const exportChart = async () => {
    if (chartRef.current) {
        try {
            const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff' });
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = url;
            link.download = `dt_analysis_chart_${selectedMetric}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Failed to export chart', err);
        }
    }
  };

  const exportReport = () => {
      const headers = ['Group', 'N', 'Mean DT', 'SD', 'SEM'];
      const groupRows = groups.map(g => {
          const sem = g.sd / Math.sqrt(g.n);
          return [
              `"${g.name}"`, 
              g.n, 
              g.mean.toFixed(4), 
              g.sd.toFixed(4), 
              sem.toFixed(4)
          ].join(',');
      });

      let content = `Metric: ${metricOptions.find(o => o.value === selectedMetric)?.label}\n`;
      content += headers.join(',') + '\n' + groupRows.join('\n');

      if (statsResult) {
          content += `\n\nStatistical Analysis\n`;
          content += `Test Type,${statsResult.testType}\n`;
          content += `Significance,${statsResult.significant ? 'Yes' : 'No'}\n`;
          content += `P-Value,${statsResult.pValue !== null ? statsResult.pValue.toFixed(6) : 'N/A'}\n`;
          content += `Details,"${statsResult.details}"\n`;

          if (statsResult.comparisons && statsResult.comparisons.length > 0) {
              content += `\nPairwise Comparisons\nGroup 1,Group 2,P-Value,Significant\n`;
              statsResult.comparisons.forEach(c => {
                  content += `"${c.group1}","${c.group2}",${c.pValue.toFixed(6)},${c.significant ? 'Yes' : 'No'}\n`;
              });
          }
      }

      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dt_statistical_report_${selectedMetric}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (selectedWells.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white rounded-lg border border-slate-200 border-dashed p-10">
        <FlaskConical size={48} className="mb-4 text-slate-300" />
        <p className="text-lg font-medium">No Data Selected</p>
        <p className="text-sm">Use the checkboxes in the Results Table to select wells for statistical analysis.</p>
      </div>
    );
  }

  const controlKeywords = ['control', 'wildtype', 'wild-type', 'wt', 'by4741', 'by', 'by4742'];
  const isControlName = (name: string) => {
    const n = name.toLowerCase().trim();
    return controlKeywords.some(k => n === k || n.startsWith(k + ' ') || n.startsWith(k + '_') || n.startsWith(k + '-'));
  };

  const chartData = groups.map(g => {
    // Calculate Standard Error of the Mean (SEM) = SD / sqrt(N)
    const sem = g.sd / Math.sqrt(g.n);
    return {
        name: g.name,
        mean: parseFloat(g.mean.toFixed(4)),
        sd: parseFloat(g.sd.toFixed(4)),
        sem: parseFloat(sem.toFixed(4)),
        // Recharts ErrorBar expects [minus, plus] offsets relative to the value
        error: [parseFloat(sem.toFixed(4)), parseFloat(sem.toFixed(4))], 
        isControl: isControlName(g.name)
    };
  });

  const colors = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
  const currentLabel = metricOptions.find(o => o.value === selectedMetric)?.label || 'DT';

  return (
    <div className="space-y-6">
      
      {/* Metric Selector */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center gap-4">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
            <SlidersHorizontal size={18} />
            <span>Analysis Metric:</span>
        </div>
        <select 
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
            className="border-slate-300 rounded-md text-sm shadow-sm focus:border-science-500 focus:ring-science-500 py-1.5 pl-3 pr-8"
        >
            {metricOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
        <div className="text-xs text-slate-500 ml-auto hidden sm:block">
            Calculations and chart will update based on this selection.
        </div>
      </div>

      <div className="flex flex-col gap-6">
        
        {/* Chart Section */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 min-h-[400px]">
          <div className="flex justify-between items-center mb-4">
             <div>
                <h3 className="text-lg font-semibold text-slate-800">Doubling Time Comparison</h3>
                <span className="text-xs text-slate-400">Error Bars = SEM</span>
             </div>
             <button 
                onClick={exportChart}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
             >
                <Camera size={14} />
                Save Chart
             </button>
          </div>
          
          <div ref={chartRef} className="bg-white p-2">
            <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" angle={-15} textAnchor="end" interval={0} height={60} tick={{fontSize: 12}} />
                <YAxis 
                    label={{ 
                    value: `Mean ${currentLabel} (min)`, 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { textAnchor: 'middle' },
                    offset: 10
                    }} 
                />
                <Tooltip 
                    cursor={{fill: 'transparent'}}
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                                <div className="bg-white p-3 border border-slate-200 shadow-md rounded text-sm">
                                    <p className="font-bold text-slate-800 mb-1">{d.name}</p>
                                    <div className="space-y-0.5 text-slate-600">
                                        <p>Mean: {d.mean}</p>
                                        <p>SEM: ±{d.sem}</p>
                                        <p className="text-xs text-slate-400 mt-1">(SD: {d.sd})</p>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Bar dataKey="mean" name="Mean DT" isAnimationActive={false}>
                    {chartData.map((entry, index) => (
                        <Cell 
                            key={`cell-${index}`} 
                            fill={entry.isControl ? '#000000' : colors[index % colors.length]} 
                        />
                    ))}
                    <ErrorBar dataKey="error" width={4} strokeWidth={2} stroke="#334155" />
                </Bar>
                </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats Report Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
           <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Statistical Report</h3>
              <div className="flex gap-2">
                  <button 
                    onClick={() => setShowMethods(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                    title="View Methods"
                  >
                    <BookOpen size={14} />
                    Methods
                  </button>
                  <button 
                    onClick={exportReport}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-science-600 hover:bg-science-700 rounded transition-colors"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
              </div>
           </div>
           
           <div className="space-y-4">
             {groups.map((g, idx) => {
               const isCtrl = isControlName(g.name);
               return (
                <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-50 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: isCtrl ? '#000000' : colors[idx % colors.length] }}></div>
                        <span className="font-medium text-slate-700">{g.name}</span>
                        <span className="text-xs text-slate-400">(n={g.n})</span>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-slate-900">{g.mean.toFixed(2)} ± {g.sd.toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400">Mean ± SD</div>
                    </div>
                </div>
               );
             })}
           </div>

           <div className="mt-8 pt-4 border-t border-slate-200">
             <h4 className="text-sm font-bold text-slate-900 uppercase mb-2">Test Results</h4>
             
             {statsResult ? (
               <div className="text-sm space-y-3">
                 <div className="flex justify-between">
                    <span className="text-slate-500">Test Type:</span>
                    <span className="font-medium">{statsResult.testType}</span>
                 </div>
                 {statsResult.pValue !== null && (
                    <div className="flex justify-between">
                        <span className="text-slate-500">P-Value:</span>
                        {/* Logic: P > 0.05 is RED (Not Significant warning), P <= 0.05 is BLUE (Significant) */}
                        <span className={`font-mono font-bold ${statsResult.pValue > 0.05 ? 'text-red-600' : 'text-blue-600'}`}>
                            {statsResult.pValue < 0.0001 ? '< 0.0001' : statsResult.pValue.toFixed(6)}
                        </span>
                    </div>
                 )}
                 <div className="text-xs text-slate-400 font-mono mt-1">
                    {statsResult.details}
                 </div>

                 {statsResult.comparisons && (
                   <div className="mt-4 space-y-2">
                     <p className="font-medium text-xs uppercase text-slate-500">Pairwise Comparisons (Bonferroni)</p>
                     {statsResult.comparisons.map((comp, i) => (
                        <div key={i} className="flex justify-between text-xs bg-slate-50 p-2 rounded">
                            <span>{comp.group1} vs {comp.group2}</span>
                            <span className={comp.pValue > 0.05 ? 'text-red-600 font-bold' : 'text-blue-600 font-bold'}>
                                {comp.pValue < 0.0001 ? '< 0.0001' : comp.pValue.toFixed(6)}
                            </span>
                        </div>
                     ))}
                   </div>
                 )}
               </div>
             ) : (
               <p className="text-sm text-slate-400 italic">Select at least 2 groups with valid data to perform statistical analysis.</p>
             )}
           </div>
        </div>

      </div>

      {/* Methodology Modal */}
      {showMethods && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-900">Statistical Methods</h3>
                    <button 
                        onClick={() => setShowMethods(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-6 text-sm text-slate-700">
                    <section>
                        <h4 className="font-bold text-slate-900 mb-2">Descriptive Statistics</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Group Mean:</strong> Arithmetic average of the selected metric (Doubling Time).</li>
                            <li><strong>Standard Deviation (SD):</strong> Measure of the amount of variation or dispersion of the values.</li>
                            <li><strong>Standard Error of Mean (SEM):</strong> Calculated as <code>SD / √n</code>. This is the value displayed in the error bars.</li>
                        </ul>
                    </section>
                    
                    <section>
                        <h4 className="font-bold text-slate-900 mb-2">Hypothesis Testing</h4>
                        <p className="mb-2">Tests are automatically selected based on the number of groups compared:</p>
                        
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
                            <span className="font-semibold block mb-1">2 Groups: Welch's T-Test</span>
                            <p className="text-xs text-slate-600">
                                An adaptation of Student's t-test that is more reliable when two samples have unequal variances and unequal sample sizes.
                            </p>
                        </div>
                        
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <span className="font-semibold block mb-1">3+ Groups: One-Way ANOVA</span>
                            <p className="text-xs text-slate-600 mb-2">
                                Compares the means of three or more independent groups to determine if at least one mean is different from the others.
                            </p>
                            <span className="font-semibold block mb-1 text-xs">Post-Hoc: Bonferroni Correction</span>
                            <p className="text-xs text-slate-600">
                                If ANOVA is performed, pairwise t-tests are conducted with Bonferroni correction (Alpha = 0.05 / Number of Comparisons) to control the family-wise error rate.
                            </p>
                        </div>
                    </section>

                    <section>
                        <h4 className="font-bold text-slate-900 mb-2">P-Value Calculation</h4>
                        <p>
                            Exact P-values are computed client-side using regularized incomplete Beta functions and Log-Gamma functions to derive the Cumulative Distribution Function (CDF) for both T and F distributions.
                        </p>
                    </section>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button 
                        onClick={() => setShowMethods(false)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-medium text-sm transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default StatsView;
