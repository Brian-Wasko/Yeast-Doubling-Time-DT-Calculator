import { ODDataPoint } from '../types';

// Regex for A1, A 1, P24, etc.
const WELL_PATTERN = /^[A-Pa-p]\s*\d{1,2}$/;

/**
 * Calculates linear regression for doubling time over the entire provided dataset.
 * Logic: ln(OD) = slope * time + intercept
 * Doubling Time = ln(2) / slope
 */
export const calculateRegression = (data: ODDataPoint[]): { slope: number; rSquared: number; dt: number | null } => {
  const n = data.length;
  if (n < 2) {
    return { slope: 0, rSquared: 0, dt: null };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (const point of data) {
    // We use time (assumed in minutes) for X
    const x = point.timeValue;
    // We use ln(OD) for Y
    const y = Math.log(point.od);

    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, rSquared: 0, dt: null };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  
  // R-squared calculation
  const intercept = (sumY - slope * sumX) / n;
  const ssTot = sumYY - (sumY * sumY) / n;
  const ssRes = sumYY - intercept * sumY - slope * sumXY;
  
  // Prevent division by zero or slightly negative variance due to float precision
  const rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - (ssRes / ssTot));

  // DT = ln(2) / slope.
  let dtMin: number | null = null;
  if (slope > 0.0000001) { // Avoid divide by zero or negative growth
      dtMin = Math.log(2) / slope;
  }

  return { slope, rSquared, dt: dtMin };
};

/**
 * Calculates the "Inflection" Doubling Time.
 * Finds the steepest slope using a sliding window of 3 points (or 2 if only 2 exist)
 * within the provided valid data range.
 * Returns DT and the center point of that window (Inflection Point).
 */
export const calculateMaxSlopeRegression = (data: ODDataPoint[]): { dt: number; inflectionPoint: ODDataPoint } | null => {
    const n = data.length;
    if (n < 2) return null;

    // Transform all points to (time, lnOD) first to save repeated Math.log calls
    const points = data.map(p => ({ x: p.timeValue, y: Math.log(p.od) }));
    
    // Window size for local regression
    // If we have very few points, we just take the whole range (which is what calculating regression does)
    const WINDOW_SIZE = 3;

    if (n < WINDOW_SIZE) {
        // Fallback to overall slope if fewer points than window
        const { dt } = calculateRegression(data);
        if (dt === null) return null;
        // Return center point (or last point if len 2)
        const centerIndex = Math.floor((n - 1) / 2);
        return { 
            dt, 
            inflectionPoint: data[centerIndex]
        };
    }

    let maxSlope = -Infinity;
    let bestStartIndex = -1;

    // Sliding window
    for (let i = 0; i <= n - WINDOW_SIZE; i++) {
        const subset = points.slice(i, i + WINDOW_SIZE);
        
        // Simple linear regression on this subset
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        const m = subset.length;

        for (const p of subset) {
            sumX += p.x;
            sumY += p.y;
            sumXY += p.x * p.y;
            sumXX += p.x * p.x;
        }

        const denominator = m * sumXX - sumX * sumX;
        if (denominator !== 0) {
            const slope = (m * sumXY - sumX * sumY) / denominator;
            if (slope > maxSlope) {
                maxSlope = slope;
                bestStartIndex = i;
            }
        }
    }

    if (maxSlope > 0.0000001 && bestStartIndex !== -1) {
        // Identify the center point of the window as the inflection point
        const centerIndex = bestStartIndex + Math.floor(WINDOW_SIZE / 2);
        return {
            dt: Math.log(2) / maxSlope,
            inflectionPoint: data[centerIndex]
        };
    }
    
    return null;
};

/**
 * Sorts well labels (A1, A2... B1...)
 */
export const sortWells = (a: string, b: string): number => {
  const cleanA = a.toUpperCase().replace(/\s/g, '');
  const cleanB = b.toUpperCase().replace(/\s/g, '');

  const rowA = cleanA.charCodeAt(0);
  const rowB = cleanB.charCodeAt(0);

  if (rowA !== rowB) return rowA - rowB;

  const colA = parseInt(cleanA.substring(1) || '0', 10);
  const colB = parseInt(cleanB.substring(1) || '0', 10);

  return colA - colB;
};

export const isValidWell = (label: string): boolean => {
    return WELL_PATTERN.test(label.trim());
};

export const normalizeWellLabel = (label: string): string => {
  return label.toUpperCase().replace(/\s/g, '');
};