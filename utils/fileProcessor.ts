import { WellData, ProcessingConfig, ODDataPoint } from '../types';
import { calculateRegression, calculateMaxSlopeRegression, isValidWell, sortWells, normalizeWellLabel } from './mathUtils';
import { read, utils } from 'xlsx';

// Helper to parse layout grid
const parseLayout = (layoutText: string): Map<string, string> => {
  const nameMap = new Map<string, string>();
  if (!layoutText) return nameMap;

  const lines = layoutText.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
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
  
  // 1. Auto-detect Header Row
  let headerRowIndex = config.skipRows;
  let bestRowIndex = -1;
  let maxWellsFound = 0;

  const scanLimit = Math.min(lines.length, 100);

  for (let i = 0; i < scanLimit; i++) {
    const row = lines[i];
    if (!Array.isArray(row)) continue;

    let wellCount = 0;
    let hasTime = false;

    for (const cell of row) {
      if (cell === null || cell === undefined) continue;
      const val = String(cell).trim();
      if (isValidWell(val)) wellCount++;
      if (val.toLowerCase() === 'time') hasTime = true;
    }

    if (hasTime && wellCount > 0) {
      bestRowIndex = i;
      break; 
    }

    if (wellCount > maxWellsFound) {
      maxWellsFound = wellCount;
      bestRowIndex = i;
    }
  }

  if (bestRowIndex !== -1 && (maxWellsFound > 2 || (lines[bestRowIndex].some(c => String(c).toLowerCase() === 'time')))) {
    headerRowIndex = bestRowIndex;
  }

  if (lines.length < headerRowIndex + 1) {
    throw new Error(`File too short. Could not find header row (detected/configured at row ${headerRowIndex + 1}).`);
  }
  
  const headers = lines[headerRowIndex].map(h => String(h).trim());
  const dataRows = lines.slice(headerRowIndex + 1);

  // 2. Identify Well Columns and Time Column
  const wellIndices: number[] = [];
  let timeColIndex = -1;

  headers.forEach((h, idx) => {
    if (h && isValidWell(h)) {
      wellIndices.push(idx);
    }
    if (h && h.toLowerCase() === 'time') {
      timeColIndex = idx;
    }
  });

  if (wellIndices.length === 0) {
    throw new Error(`No valid well labels (e.g., A1, B2) found in header row ${headerRowIndex + 1}.`);
  }

  // 3. Initialize Well Data Structures
  const wellMap = new Map<string, number[]>();
  wellIndices.forEach(idx => {
    const label = headers[idx];
    wellMap.set(label, []);
  });

  // 4. Parse Data Rows
  let previousTime = -1;
  
  for (const row of dataRows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    
    // Check for footer / end of block via Time column reset
    if (timeColIndex !== -1 && timeColIndex < row.length) {
      const timeValStr = String(row[timeColIndex]).trim();
      
      // Parse time to check for 0 reset
      // Formats: 0:29:16 or just seconds/minutes number
      let currentTimeVal = 0;
      if (timeValStr.includes(':')) {
         // rough parse
         const parts = timeValStr.split(':').map(Number);
         // not critical to get exact seconds here, just checking for reset relative order
         currentTimeVal = parts[0] * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
      } else {
         currentTimeVal = parseFloat(timeValStr);
      }

      // If we have established a timeline and suddenly it drops to 0, stop.
      // We allow the first row to be 0 or small.
      if (!isNaN(currentTimeVal)) {
          if (previousTime > 0 && currentTimeVal === 0) {
              break; // Stop processing, we hit the footer/next block
          }
          previousTime = currentTimeVal;
      }
    }

    if (!row.some(cell => cell !== null && cell !== undefined && cell !== '')) continue;
    
    wellIndices.forEach(colIdx => {
      if (colIdx >= row.length) return;

      const label = headers[colIdx];
      const val = row[colIdx];
      
      if (val !== undefined && val !== null && val !== '') {
          const num = parseFloat(val as string);
          if (!isNaN(num)) {
            wellMap.get(label)?.push(num);
          }
      }
    });
  }

  // Parse layout for names
  const nameMap = layoutInput ? parseLayout(layoutInput) : new Map<string, string>();

  // 5. Calculate Blank Curve (if applicable)
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

  // 6. Calculate DT for each well
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

  // 7. Sort results
  results.sort((a, b) => sortWells(a.label, b.label));

  return results;
};