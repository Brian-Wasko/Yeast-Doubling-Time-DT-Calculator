
import React, { useState, useCallback } from 'react';
import { Settings, Info, FlaskConical, AlertTriangle, Grid3X3, ArrowRight, LayoutGrid, Activity, BarChart2 } from 'lucide-react';
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

  // Helper to map 8x12 (or 16x24) grid to well labels
  const applyLayoutNames = useCallback((currentResults: WellData[], layoutText: string): WellData[] => {
      if (!layoutText.trim()) return currentResults;

      const lines = layoutText.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
      const nameMap = new Map<string, string>();
      const rowLabels = "ABCDEFGHIJKLMNOP".split(''); // Support up to 384 well (P)

      lines.forEach((line, rIdx) => {
          if (rIdx >= rowLabels.length) return;
          
          const cells = line.split('\t');
          cells.forEach((cell, cIdx) => {
              if (cIdx >= 24) return; // Support up to 384 well (24 cols)
              
              const label = `${rowLabels[rIdx]}${cIdx + 1}`;
              const cleanName = cell.trim();
              if (cleanName) {
                  nameMap.set(label, cleanName);
              }
          });
      });

      return currentResults.map(well => ({
          ...well,
          name: nameMap.get(well.label)
      }));
  }, []);

  const handleApplyLayout = () => {
      if (results.length === 0) return;
      const updatedResults = applyLayoutNames(results, layoutInput);
      setResults(updatedResults);
      
      // Update selected well if it exists
      if (selectedWell) {
          const updatedSelected = updatedResults.find(w => w.label === selectedWell.label);
          if (updatedSelected) setSelectedWell(updatedSelected);
      }
  };

  const handleToggleStatsWell = (label: string) => {
    setSelectedStatsWells(prev => {
        const next = new Set(prev);
        if (next.has(label)) {
            next.delete(label);
        } else {
            next.add(label);
        }
        return next;
    });
  };

  // Processing Handler
  const handleProcess = useCallback(async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setError(null);

    const reader = new FileReader();
    const isBinary = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');

    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (!result) throw new Error("File is empty");

        let processedData = processFileContent(
          result as string | ArrayBuffer, 
          config, 
          isBinary ? 'binary' : 'text',
          layoutInput // Pass layoutInput directly for blank detection
        );
        
        // Also ensure names are applied (redundant but safe if processFileContent didn't get names)
        if (layoutInput.trim()) {
            processedData = applyLayoutNames(processedData, layoutInput);
        }
        
        setResults(processedData);
        if (processedData.length > 0) {
          setSelectedWell(processedData[0]);
        }
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
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }, [file, config, layoutInput, applyLayoutNames]);

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
          <div className="text-sm text-slate-500 hidden sm:block">
            Biotech Epoch2 Platereader Compatible
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
                  onClick={handleProcess}
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
                    <p>
                        <strong>DT Interval (Avg):</strong> Uses linear regression on all log-transformed OD points falling within the Lower/Upper OD limits.
                    </p>
                    <p className="pt-0 text-slate-500 font-mono text-[10px]">
                        Formula: DT = ln(2) / slope
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
