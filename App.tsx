
import React, { useState, useCallback } from 'react';
import { Settings, Info, FlaskConical, AlertTriangle, Grid3X3, ArrowRight, LayoutGrid, Activity, BarChart2, BookOpen } from 'lucide-react';
import { ProcessingConfig, WellData } from './types';
import { processFileContent } from './utils/fileProcessor';
import ResultsTable from './components/ResultsTable';
import GrowthChart from './components/GrowthChart';
import PlateOverview from './components/PlateOverview';
import StatsView from './components/StatsView';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Configuration State
  const [config, setConfig] = useState<ProcessingConfig>({
    lowOD: 0.25,
    highOD: 0.5,
    skipRows: 25,
    timeInterval: 30,
    blankWells: ''
  });

  // Plate Layout Naming State
  const [layoutInput, setLayoutInput] = useState<string>('');
  
  // View State
  const [activeTab, setActiveTab] = useState<'detail' | 'plate' | 'stats'>('detail');

  // Results State
  const [results, setResults] = useState<WellData[]>([]);
  const [selectedWell, setSelectedWell] = useState<WellData | null>(null);
  const [selectedStatsWells, setSelectedStatsWells] = useState<Set<string>>(new Set());
  const [autoGroupingEnabled, setAutoGroupingEnabled] = useState(false);

  // File Upload Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setResults([]);
      setSelectedWell(null);
      setSelectedStatsWells(new Set());

      // Auto-adjust default skipRows based on file extension
      const isExcel = selectedFile.name.toLowerCase().endsWith('.xls') || selectedFile.name.toLowerCase().endsWith('.xlsx');
      setConfig(prev => ({
        ...prev,
        skipRows: isExcel ? 26 : 25
      }));
    }
  };

  // Core Processing Logic
  const processData = useCallback((fileToProcess: File, configToUse: ProcessingConfig, layoutToUse: string) => {
    setIsProcessing(true);
    setError(null);

    const reader = new FileReader();
    const isBinary = fileToProcess.name.toLowerCase().endsWith('.xls') || fileToProcess.name.toLowerCase().endsWith('.xlsx');

    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (!result) throw new Error("File is empty");

        const processedData = processFileContent(
          result as string | ArrayBuffer, 
          configToUse, 
          isBinary ? 'binary' : 'text',
          layoutToUse 
        );
        
        setResults(processedData);
        
        // Preserve selection if possible
        setSelectedWell(prev => {
            if (!prev) return processedData.length > 0 ? processedData[0] : null;
            return processedData.find(w => w.label === prev.label) || processedData[0] || null;
        });

      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error parsing file");
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setError("Failed to read file");
      setIsProcessing(false);
    };

    if (isBinary) {
      reader.readAsArrayBuffer(fileToProcess);
    } else {
      reader.readAsText(fileToProcess);
    }
  }, []);

  // Button Click Handler for Manual Process/Recalculate
  const handleProcessClick = () => {
    if (file) {
      processData(file, config, layoutInput);
    }
  };

  const handleApplyLayout = () => {
      // 1. Parse layout to find 'blank' wells to auto-populate config
      const lines = layoutInput.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
      const rowLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
      const blankLabels: string[] = [];
      
      lines.forEach((line, rIdx) => {
          if (rIdx >= rowLabels.length) return;
          const cells = line.split('\t');
          cells.forEach((cell, cIdx) => {
               if (cIdx >= 24) return; // Support up to 24 columns for now (384 well)
               const cleanName = cell.trim().toLowerCase();
               if (cleanName === 'blank') {
                   blankLabels.push(`${rowLabels[rIdx]}${cIdx + 1}`);
               }
          });
      });

      // 2. Update config if blanks found
      let nextConfig = { ...config };
      if (blankLabels.length > 0) {
          const newBlanks = blankLabels.join(', ');
          nextConfig = { ...nextConfig, blankWells: newBlanks };
          setConfig(nextConfig);
      }

      // 3. Trigger Recalculation Automatically with new config and names
      if (file) {
          processData(file, nextConfig, layoutInput);
      }
  };

  const handleToggleStatsWell = useCallback((label: string) => {
    const well = results.find(w => w.label === label);
    if (!well) return;

    // Determine target labels (just this one, or all with same name)
    const targetLabels = new Set<string>();
    targetLabels.add(label);

    if (autoGroupingEnabled && well.name && well.name.trim() !== '') {
         results.forEach(w => {
            if (w.name === well.name) {
                targetLabels.add(w.label);
            }
        });
    }

    setSelectedStatsWells(prev => {
        const next = new Set(prev);
        // Determine action based on the state of the specific well clicked
        // If it's selected, we deselect all targets. If not, we select all targets.
        const willSelect = !next.has(label);

        targetLabels.forEach(l => {
            if (willSelect) {
                next.add(l);
            } else {
                next.delete(l);
            }
        });
        return next;
    });
  }, [results, autoGroupingEnabled]);

  const handleToggleAllStats = useCallback((selectAll: boolean) => {
    if (selectAll) {
        const allLabels = new Set(results.map(r => r.label));
        setSelectedStatsWells(allLabels);
    } else {
        setSelectedStatsWells(new Set());
    }
  }, [results]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-science-600 p-2 rounded-lg text-white">
              <FlaskConical size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Yeast Doubling Time (DT) Calculator
            </h1>
          </div>
          <div className="flex items-center gap-4 hidden sm:flex">
            <div className="text-sm text-slate-500">
              Biotech Epoch2 Platereader Compatible
            </div>
            <a 
              href="https://github.com/Brian-Wasko/Yeast-Doubling-Time-DT-Calculator#readme" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-science-600 hover:text-science-700 bg-science-50 hover:bg-science-100 px-3 py-1.5 rounded-md transition-colors border border-science-100"
            >
              <BookOpen size={16} />
              Documentation
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Top Control Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
          
          {/* Settings Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-4 text-slate-800">
                <Settings size={18} />
                <h2 className="font-semibold">Configuration</h2>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Lower OD Limit
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={config.lowOD}
                      onChange={(e) => setConfig({ ...config, lowOD: parseFloat(e.target.value) })}
                      className="w-full rounded-md border-slate-600 bg-slate-700 text-white shadow-sm focus:border-science-500 focus:ring-science-500 sm:text-sm border p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Upper OD Limit
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={config.highOD}
                      onChange={(e) => setConfig({ ...config, highOD: parseFloat(e.target.value) })}
                      className="w-full rounded-md border-slate-600 bg-slate-700 text-white shadow-sm focus:border-science-500 focus:ring-science-500 sm:text-sm border p-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Skip Rows
                    </label>
                    <input
                      type="number"
                      value={config.skipRows}
                      onChange={(e) => setConfig({ ...config, skipRows: parseInt(e.target.value) })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-science-500 focus:ring-science-500 sm:text-sm border p-2 bg-slate-50"
                      title="Number of rows to skip before header"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Interval (min)
                    </label>
                    <input
                      type="number"
                      value={config.timeInterval}
                      onChange={(e) => setConfig({ ...config, timeInterval: parseFloat(e.target.value) })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-science-500 focus:ring-science-500 sm:text-sm border p-2 bg-slate-50"
                      title="Time interval between readings in minutes"
                    />
                  </div>
                </div>

                 <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Blank Wells
                    </label>
                    <input
                      type="text"
                      value={config.blankWells}
                      onChange={(e) => setConfig({ ...config, blankWells: e.target.value })}
                      className="w-full rounded-md border-slate-300 shadow-sm focus:border-science-500 focus:ring-science-500 sm:text-sm border p-2 bg-slate-50"
                      placeholder="e.g. H12, H11"
                      title="Comma separated list of wells to calculate blank average from"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                        Average of these wells will be subtracted from all data.
                    </p>
                  </div>

                <div className="pt-2">
                   <label className="flex flex-col gap-2 w-full">
                      <span className="block text-xs font-medium text-slate-500">Data File (.csv, .txt, .xls, .xlsx)</span>
                      <div className="flex gap-2">
                        <input 
                            type="file" 
                            accept=".csv,.txt,.xls,.xlsx"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-slate-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-science-50 file:text-science-700
                              hover:file:bg-science-100
                              cursor-pointer
                            "
                        />
                      </div>
                    </label>
                </div>

                <button
                  onClick={handleProcessClick}
                  disabled={!file || isProcessing}
                  className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                    ${!file || isProcessing ? 'bg-slate-300 cursor-not-allowed' : 'bg-science-600 hover:bg-science-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-science-500'}
                  `}
                >
                  {isProcessing ? 'Processing...' : (results.length > 0 ? 'Recalculate' : 'Calculate Doubling Times')}
                </button>
              </div>
            </div>

            {/* Plate Naming Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
               <div className="flex items-center gap-2 mb-4 text-slate-800">
                <Grid3X3 size={18} />
                <h2 className="font-semibold">Plate Layout Naming</h2>
              </div>
              <div className="space-y-3">
                 <p className="text-xs text-slate-500">
                    Paste an 8x12 (96-well) or 16x24 (384-well) Excel grid here to name your conditions. The top-left cell corresponds to A1.
                 </p>
                 <textarea 
                    className="w-full h-32 p-2 text-xs font-mono border border-slate-600 bg-slate-700 text-white rounded-md focus:border-science-500 focus:ring-science-500 resize-none whitespace-pre"
                    placeholder={`Paste Excel grid here...\nExample:\nCond1\tCond2\t...\nCond1\tCond2\t...`}
                    value={layoutInput}
                    onChange={(e) => setLayoutInput(e.target.value)}
                 />
                 <button
                    onClick={handleApplyLayout}
                    disabled={results.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 border border-slate-300 rounded-md shadow-sm text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    Apply Names to Results <ArrowRight size={12}/>
                 </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 space-y-3">
                <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="font-semibold">Calculation Modes</p>
                </div>
                <div className="text-xs space-y-2 pl-7">
                    <p className="pt-0 text-slate-500 font-mono text-[10px]">
                        Formula: DT = ln(2) / slope
                    </p>
                    <p>
                        <strong>DT Interval (Avg):</strong> Uses linear regression on all log-transformed OD points falling within the Lower/Upper OD limits.
                    </p>
                    <p>
                        <strong>DT Inflection (Max Rate):</strong> Finds the steepest slope (fastest growth) within the OD limits using a sliding window. This represents the max doubling rate.
                    </p>
                </div>
            </div>

          </div>

          {/* Main Visualization Area */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* View Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('detail')}
                    className={`
                        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                        ${activeTab === 'detail' 
                            ? 'border-science-600 text-science-700 bg-science-50/50' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }
                    `}
                >
                    <Activity size={16} />
                    Detailed Analysis
                </button>
                <button
                    onClick={() => setActiveTab('plate')}
                    className={`
                        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                        ${activeTab === 'plate' 
                            ? 'border-science-600 text-science-700 bg-science-50/50' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }
                    `}
                >
                    <LayoutGrid size={16} />
                    Plate Overview
                </button>
                <button
                    onClick={() => setActiveTab('stats')}
                    className={`
                        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                        ${activeTab === 'stats' 
                            ? 'border-science-600 text-science-700 bg-science-50/50' 
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }
                    `}
                >
                    <BarChart2 size={16} />
                    Statistical Analysis
                </button>
            </div>

            {activeTab === 'detail' && (
                <>
                    <div className="h-[400px]">
                        <GrowthChart 
                            wellData={selectedWell} 
                            lowOD={config.lowOD} 
                            highOD={config.highOD} 
                        />
                    </div>
                    <div className="flex-1 min-h-[400px]">
                        <ResultsTable 
                            data={results} 
                            onSelectWell={setSelectedWell} 
                            selectedWellLabel={selectedWell?.label}
                            selectedStatsWells={selectedStatsWells}
                            onToggleStatsWell={handleToggleStatsWell}
                            onToggleAllStats={handleToggleAllStats}
                            autoGroupingEnabled={autoGroupingEnabled}
                            onToggleAutoGrouping={setAutoGroupingEnabled}
                        />
                    </div>
                </>
            )}

            {activeTab === 'plate' && (
                <div className="flex-1 min-h-[600px]">
                    <PlateOverview 
                        results={results}
                        onSelectWell={(well) => {
                            setSelectedWell(well);
                            setActiveTab('detail');
                        }}
                        selectedWellLabel={selectedWell?.label}
                        lowOD={config.lowOD}
                        highOD={config.highOD}
                    />
                </div>
            )}

            {activeTab === 'stats' && (
                <div className="flex-1 min-h-[600px]">
                    <StatsView 
                        selectedWells={results.filter(w => selectedStatsWells.has(w.label))}
                    />
                    <div className="mt-8">
                       <h3 className="text-md font-semibold text-slate-800 mb-2 px-1">Source Data Selection</h3>
                       <ResultsTable 
                            data={results} 
                            onSelectWell={setSelectedWell} 
                            selectedWellLabel={selectedWell?.label}
                            selectedStatsWells={selectedStatsWells}
                            onToggleStatsWell={handleToggleStatsWell}
                            onToggleAllStats={handleToggleAllStats}
                            autoGroupingEnabled={autoGroupingEnabled}
                            onToggleAutoGrouping={setAutoGroupingEnabled}
                        />
                    </div>
                </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
