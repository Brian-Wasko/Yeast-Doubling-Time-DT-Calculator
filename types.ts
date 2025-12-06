
export interface ODDataPoint {
  timeValue: number; // Time in minutes (based on interval)
  od: number;
  included: boolean; // whether it falls within the low/high OD range
}

export interface WellData {
  label: string;
  name?: string; // Optional user-defined condition name
  rawValues: number[];
  dataPoints: ODDataPoint[];
  doublingTimeMin: number | null; // Regression over entire range
  doublingTimeInflection: number | null; // Regression over steepest slope window
  doublingTimeGlobal: number | null; // Regression over steepest slope of ENTIRE curve
  inflectionPoint: { timeValue: number; od: number } | null; // The specific point where max slope was found in range
  globalInflectionPoint: { timeValue: number; od: number } | null; // The specific point where max slope was found over ENTIRE curve
  minOD: number;
  maxOD: number;
  lagTime: number | null;
  rSquared: number | null;
  slope: number | null;
  isHighInitialOD: boolean; // Flag if initial reading >= lowOD
}

export interface ProcessingConfig {
  lowOD: number;
  highOD: number;
  skipRows: number; // Default 25 (CSV) or 26 (Excel)
  timeInterval: number; // Default 30 min
  blankWells: string; // Comma separated list of wells to subtract (e.g. "H12")
}

export interface CalculationResult {
  filename: string;
  results: WellData[];
}

export interface StatsGroup {
  name: string;
  wells: WellData[];
  mean: number;
  sd: number;
  n: number;
}

export interface StatsResult {
  testType: 'T-Test' | 'ANOVA' | 'None';
  pValue: number | null;
  significant: boolean;
  details: string;
  comparisons?: { group1: string; group2: string; pValue: number; significant: boolean }[];
}
