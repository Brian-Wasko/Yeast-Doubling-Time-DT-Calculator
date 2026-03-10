
import { WellData, ProcessingConfig, ODDataPoint } from '../types';
import { calculateRegression, calculateMaxSlopeRegression, isValidWell, sortWells, normalizeWellLabel } from './mathUtils';
import { read, utils } from 'xlsx';

// Helper to parse layout grid
const parseLayout = (layoutText: string): Map<string, string> => {
  const nameMap = new Map<string, string>();
  if (!layoutText) return nameMap;

  const lines = layoutText.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
  const rowLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(''); // Support up to 26 rows (A-Z)
  
  lines.forEach((line, rIdx) => {
      if (rIdx >= rowLabels.length) return;
      
      const cells = line.split('\t');
      cells.forEach((cell, cIdx) => {
          // Support 384 well (24 cols) and beyond. 
          if (cIdx >= 48) return; 
          
          const label = `${rowLabels[rIdx]}${cIdx + 1}`;
          const cleanName = cell.trim();
          if (cleanName) {
              nameMap.set(label, cleanName);
          }
      });
  });
  return nameMap;
};

export const processFileContent = (
  content: string | ArrayBuffer, 
  config: ProcessingConfig,
  fileType: 'text' | 'binary',
  layoutInput?: string
): WellData[] => {
  
  let lines: any[][] = [];

  if (fileType === 'binary') {
    // Parse Excel
    const workbook = read(content, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    // Convert to array of arrays
    lines = utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
  } else {
    // Parse CSV/Text
    const textContent = content as string;
    // Handle universal newlines and potential tab delimiters
    lines = textContent.split(/\r\n|\n/).map(line => {
      // Basic separator detection per line to be robust
      const separator = line.includes('\t') ? '\t' : ',';
      return line.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
    });
  }
  
  // Initialize Well Data Structures
  const wellMap = new Map<string, number[]>();
  
  // State for block parsing
  let activeColMap = new Map<number, string>(); // colIndex -> wellLabel
  let activeTimeIndex = -1;
  let headersFound = false;

  // Iterate through all lines starting from skipRows
  // We scan the entire file to find multiple blocks of data (common in 384-well exports or extended runs)
  const startRow = Math.max(0, config.skipRows);
  
  for (let i = startRow; i < lines.length; i++) {
    const row = lines[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Convert row to string array for robust checking
    const strRow = row.map(c => c !== null && c !== undefined ? String(c).trim() : '');
    
    // Check if this is a Header Row
    // Criteria: Contains "Time" (case insensitive) AND at least one valid well label (e.g. A1, B2)
    // This allows us to detect the start of a new data block
    const timeIndex = strRow.findIndex(s => s.toLowerCase() === 'time');
    const hasWellLabel = strRow.some(s => isValidWell(s));

    if (timeIndex !== -1 && hasWellLabel) {
        // Start of a new block
        activeColMap = new Map();
        activeTimeIndex = timeIndex;
        headersFound = true;
        
        strRow.forEach((cell, idx) => {
            if (isValidWell(cell)) {
                // Map the column index to the well label
                activeColMap.set(idx, cell);
                
                // Initialize array if this is the first time we see this well
                if (!wellMap.has(cell)) {
                    wellMap.set(cell, []);
                }
            }
        });
        continue; // Move to next row (data)
    }

    // Process Data Row if we are inside a valid block
    if (activeColMap.size > 0 && activeTimeIndex !== -1) {
        // Validate it's a data row by checking the Time column
        const timeValStr = strRow[activeTimeIndex];
        
        // If Time column is empty or header-like, it's not data
        if (!timeValStr || timeValStr.toLowerCase() === 'time') continue;
        
        // Note: We don't strictly parse the time value for x-axis (we use fixed interval), 
        // but checking it helps ensure valid data rows.
        // We accept it if it's not empty.

        // Extract OD values for mapped columns
        activeColMap.forEach((label, colIdx) => {
            if (colIdx < row.length) {
                const val = row[colIdx];
                if (val !== undefined && val !== null && val !== '') {
                    const num = parseFloat(val as string);
                    if (!isNaN(num)) {
                        wellMap.get(label)?.push(num);
                    }
                }
            }
        });
    }
  }

  if (!headersFound) {
      throw new Error(`Could not find any valid header row containing 'Time' and well labels (e.g. A1) after row ${startRow}. Check 'Skip Rows' setting.`);
  }

  if (wellMap.size === 0) {
      throw new Error("Found headers but no valid data points extracted.");
  }

  // Parse layout for names
  const nameMap = layoutInput ? parseLayout(layoutInput) : new Map<string, string>();

  // Calculate Blank Curve (if applicable)
  let blankCurve: number[] = [];
  
  const rawBlanks = config.blankWells.split(',').map(s => s.trim()).filter(s => s.length > 0);
  const blankWellsSet = new Set<string>();

  rawBlanks.forEach(token => {
      // 1. Check if token is a direct well label (e.g. "H12")
      const normalized = normalizeWellLabel(token);
      if (wellMap.has(normalized)) {
          blankWellsSet.add(normalized);
      } else {
          // 2. Check if token matches a name (e.g. "Blank")
          // Find all wells with this name
          for (const [wellLabel, wellName] of nameMap.entries()) {
              if (wellName === token && wellMap.has(wellLabel)) {
                  blankWellsSet.add(wellLabel);
              }
          }
      }
  });

  const blanks = Array.from(blankWellsSet);

  if (blanks.length > 0) {
      // Find the length of the shortest dataset to avoid index out of bounds
      const minLen = Math.min(...blanks.map(b => wellMap.get(b)?.length || 0));
      
      if (minLen > 0) {
        blankCurve = new Array(minLen).fill(0);
        for (let i = 0; i < minLen; i++) {
            let sum = 0;
            for (const b of blanks) {
                sum += (wellMap.get(b)?.[i] || 0);
            }
            blankCurve[i] = sum / blanks.length;
        }
      }
  }

  // Calculate DT for each well
  const results: WellData[] = [];

  wellMap.forEach((rawValues, label) => {
    // Subtract blank if available
    const correctedValues = rawValues.map((val, idx) => {
        if (blankCurve.length > idx) {
            return val - blankCurve[idx];
        }
        return val;
    });

    // Min/Max OD from corrected data
    const minOD = correctedValues.length > 0 ? Math.min(...correctedValues) : 0;
    const maxOD = correctedValues.length > 0 ? Math.max(...correctedValues) : 0;

    const dataPoints: ODDataPoint[] = correctedValues.map((od, idx) => ({
      timeValue: idx * config.timeInterval,
      od,
      included: od >= config.lowOD && od <= config.highOD
    }));

    // Filter points for calculations
    
    // a) Range-Included Points (for standard DT and range-inflection)
    const includedPoints = dataPoints.filter(p => p.included);
    
    // b) Valid Positive Points (for global inflection over entire curve)
    // Log(OD) requires OD > 0. Blank subtraction might make some negative/zero.
    const validGlobalPoints = dataPoints.filter(p => p.od > 0.0000001);

    const isHighInitialOD = dataPoints.length > 0 && dataPoints[0].od >= config.lowOD;

    // Standard Avg Regression
    const { slope, dt, rSquared } = calculateRegression(includedPoints);

    // Inflection (Steepest Slope) Regression - Within Range
    const inflectionRes = calculateMaxSlopeRegression(includedPoints);

    // Global Inflection (Steepest Slope) - Entire Curve
    const globalInflectionRes = calculateMaxSlopeRegression(validGlobalPoints);

    // Calculate Lag Time based on Global Inflection
    let lagTime: number | null = null;
    let doublingTimeGlobal: number | null = null;

    if (globalInflectionRes && globalInflectionRes.dt) {
        doublingTimeGlobal = globalInflectionRes.dt;

        // Slope = ln(2) / DT
        const slopeGlobal = Math.log(2) / globalInflectionRes.dt;
        const tInfl = globalInflectionRes.inflectionPoint.timeValue;
        const odInfl = globalInflectionRes.inflectionPoint.od;
        
        // Use the absolute minimum OD (or a small epsilon if 0/negative) as the baseline for Lag calculation
        // Equation: ln(OD_infl) = slope * (t_infl - t_lag) + ln(OD_min)
        // t_lag = t_infl - (ln(OD_infl) - ln(OD_min)) / slope
        const baselineOD = Math.max(minOD, 0.0001);
        if (baselineOD > 0 && odInfl > 0 && slopeGlobal > 0) {
             lagTime = tInfl - (Math.log(odInfl) - Math.log(baselineOD)) / slopeGlobal;
        }
    }

    results.push({
      label,
      name: nameMap.get(label), // Assign name
      rawValues: correctedValues, // Store corrected values for chart
      dataPoints,
      doublingTimeMin: dt,
      doublingTimeInflection: inflectionRes ? inflectionRes.dt : null,
      doublingTimeGlobal: doublingTimeGlobal,
      inflectionPoint: inflectionRes ? inflectionRes.inflectionPoint : null,
      globalInflectionPoint: globalInflectionRes ? globalInflectionRes.inflectionPoint : null,
      minOD,
      maxOD,
      lagTime,
      slope,
      rSquared,
      isHighInitialOD
    });
  });

  // Sort results
  results.sort((a, b) => sortWells(a.label, b.label));

  return results;
};
