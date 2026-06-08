
import { ODDataPoint } from '../types';
import { levenbergMarquardt } from 'ml-levenberg-marquardt';

// Regex for A1, A 1, P24, etc. 
// Updated to support rows A-Z (and potentially double letters) and up to 3 digits for columns to robustly support 384 well plates.
const WELL_PATTERN = /^[A-Za-z]{1,2}\s*\d{1,3}$/;

/**
 * Calculates trapezoidal Area Under the Curve (AUC) for the given dataset.
 */
export const calculateAUC = (data: ODDataPoint[]): number | null => {
  if (data.length < 2) return null;
  let auc = 0;
  for (let i = 1; i < data.length; i++) {
    const p1 = data[i - 1];
    const p2 = data[i];
    const dt = p2.timeValue - p1.timeValue;
    const avgOD = (p1.od + p2.od) / 2;
    auc += dt * avgOD;
  }
  return auc;
};

/**
 * Fits OD data to the Modified Gompertz Equation.
 * y(t) = y0 + A * exp(-exp((mu_max * e / A) * (lambda_phase - t) + 1))
 */
export const fitGompertz = (data: ODDataPoint[]) => {
  if (data.length < 5) return null;

  // Extract variables
  const t = data.map(p => p.timeValue);
  const y = data.map(p => p.od);

  // Initial Guesses heuristics
  const y0_guess = Math.min(...y);
  const max_y = Math.max(...y);
  const A_guess = max_y - y0_guess;

  // Use previously created calculateMaxSlopeRegression logic on *untransformed* data to get max slope 
  // Wait, standard calculateMaxSlopeRegression does ln(OD), but let's do native derivative here.
  let max_slope = 0;
  let t_at_max_slope = data[0].timeValue;
  let y_at_max_slope = data[0].od;

  const WINDOW_SIZE = 3;
  for (let i = 0; i <= data.length - WINDOW_SIZE; i++) {
    const subset = data.slice(i, i + WINDOW_SIZE);
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of subset) {
      sumX += p.timeValue;
      sumY += p.od; // NOT log transformed for mu_max native
      sumXY += p.timeValue * p.od;
      sumXX += p.timeValue * p.timeValue;
    }
    const m = subset.length;
    const denominator = m * sumXX - sumX * sumX;
    if (denominator !== 0) {
      const slope = (m * sumXY - sumX * sumY) / denominator;
      if (slope > max_slope) {
        max_slope = slope;
        const centerIndex = i + Math.floor(WINDOW_SIZE / 2);
        t_at_max_slope = data[centerIndex].timeValue;
        y_at_max_slope = data[centerIndex].od;
      }
    }
  }

  const mu_max_guess = max_slope > 0 ? max_slope : 0.001;
  const lambda_guess = Math.max(0, t_at_max_slope - (y_at_max_slope - y0_guess) / mu_max_guess);

  // The function to fit: params = [y0, A, mu_max, lambda_phase]
  const e = Math.E;
  const gompertzFunction = ([y0, A, mu_max, lambda_phase]: number[]) => {
    return (x: number) => y0 + A * Math.exp(-Math.exp((mu_max * e / A) * (lambda_phase - x) + 1));
  };

  const initialValues = [y0_guess, A_guess, mu_max_guess, lambda_guess];
  const dataForFit = { x: t, y: y };

  try {
    const options = {
      damping: 1.5,
      initialValues,
      minValues: [0, 0, 0, 0], // Bounds: >= 0 to prevent biological impossibilities
      maxValues: [Math.max(...y), Math.max(...y) * 2, 1, Math.max(...t)],
      maxIterations: 200,
      gradientDifference: 1e-3
    };

    const fitted = levenbergMarquardt(dataForFit, gompertzFunction, options);
    
    if (!fitted || !fitted.parameterValues) {
        return null;
    }

    const [fit_y0, fit_A, fit_mu_max, fit_lambda_phase] = fitted.parameterValues;
    
    // Reject degenerate flat fits
    if (fit_A < 1e-4 || fit_mu_max < 1e-6) {
        return null;
    }

    return {
      y0: fit_y0,
      A: fit_A,
      mu_max: fit_mu_max,
      lambda_phase: fit_lambda_phase
    };
  } catch (error) {
    console.error("Gompertz fit error:", error);
    return null; // Return null rather than crashing on convergence failure
  }
};

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

  const colMatchA = cleanA.match(/\d+/);
  const colMatchB = cleanB.match(/\d+/);
  
  const colA = colMatchA ? parseInt(colMatchA[0], 10) : 0;
  const colB = colMatchB ? parseInt(colMatchB[0], 10) : 0;

  return colA - colB;
};

export const isValidWell = (label: string): boolean => {
    return WELL_PATTERN.test(label.trim());
};

export const normalizeWellLabel = (label: string): string => {
  return label.toUpperCase().replace(/\s/g, '');
};
