
import { WellData, StatsGroup, StatsResult } from '../types';

export const calculateMean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

export const calculateSD = (values: number[], mean: number): number => {
  if (values.length <= 1) return 0;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
};

export const groupWellsByName = (wells: WellData[], metricKey: keyof WellData = 'doublingTimeMin'): StatsGroup[] => {
  const groups: Record<string, WellData[]> = {};
  
  wells.forEach(w => {
    // Group by name if available, otherwise use label (treating individual wells as groups)
    // If name is blank/empty, default to label to avoid grouping distinct unknowns together
    const key = w.name && w.name.trim() !== '' ? w.name.trim() : w.label;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(w);
  });

  return Object.entries(groups).map(([name, groupWells]) => {
    const validDTs = groupWells
      .map(w => w[metricKey] as number | null)
      .filter((dt): dt is number => dt !== null && !isNaN(dt));
    
    const mean = calculateMean(validDTs);
    const sd = calculateSD(validDTs, mean);

    return {
      name,
      wells: groupWells,
      mean,
      sd,
      n: validDTs.length
    };
  }).filter(g => g.n > 0); // Only return groups with valid data
};

// --- Statistical Math Helpers ---

// Lanczos approximation for Log Gamma function
function logGamma(z: number): number {
  const c = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Regularized Incomplete Beta Function (Ix(a, b))
function betainc(x: number, a: number, b: number): number {
  if (x < 0.0 || x > 1.0) return 0/0; // NaN
  if (x === 0.0) return 0.0;
  if (x === 1.0) return 1.0;

  // Symmetry transform if x > (a+1)/(a+b+2) to optimize convergence
  if (x > (a + 1.0) / (a + b + 2.0)) {
    return 1.0 - betainc(1.0 - x, b, a);
  }

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  // First term of continued fraction
  const front = Math.exp(a * Math.log(x) + b * Math.log(1.0 - x) - lbeta) / a;

  // Continued Fraction (Lentz's method)
  const MAX_IT = 100;
  const EPS = 3.0e-7;
  const FP_MIN = 1.0e-30;

  let f = 1.0, c = 1.0, d = 0.0;
  
  for (let m = 1; m <= MAX_IT; m++) {
    const m2 = 2 * m;
    // Even step
    let numerator = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1.0 + numerator * d;
    if (Math.abs(d) < FP_MIN) d = FP_MIN;
    c = 1.0 + numerator / c;
    if (Math.abs(c) < FP_MIN) c = FP_MIN;
    f *= c * (1.0 / d);

    // Odd step
    numerator = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1.0 + numerator * d;
    if (Math.abs(d) < FP_MIN) d = FP_MIN;
    c = 1.0 + numerator / c;
    if (Math.abs(c) < FP_MIN) c = FP_MIN;
    f *= c * (1.0 / d);

    if (Math.abs(1.0 - c * (1.0 / d)) < EPS) {
       return front * (f - 1.0 + 1.0); // f - 1 + 1 prevents optimizer bugs in some JS engines
    }
  }
  return front * (f - 1.0 + 1.0);
}

// Student's T Cumulative Distribution Function
function studenttCDF(t: number, df: number): number {
  const x = (t + Math.sqrt(t * t + df)) / (2.0 * Math.sqrt(t * t + df)); // Map t to 0..1 for beta
  // Alternatively using relation to BetaInc:
  // p = 1 - 0.5 * betainc(df / (df + t^2), df/2, 0.5)
  const x2 = df / (df + t * t);
  return 1.0 - 0.5 * betainc(x2, df / 2.0, 0.5);
}

// F-Distribution Cumulative Distribution Function
function fDistCDF(f: number, df1: number, df2: number): number {
  if (f <= 0) return 0.0;
  const x = (df1 * f) / (df1 * f + df2);
  return betainc(x, df1 / 2.0, df2 / 2.0);
}

// --- End Math Helpers ---


// Standard T-Test (Welch's t-test for unequal variances)
export const performTTest = (group1: StatsGroup, group2: StatsGroup): StatsResult => {
  const m1 = group1.mean;
  const m2 = group2.mean;
  const s1 = group1.sd;
  const s2 = group2.sd;
  const n1 = group1.n;
  const n2 = group2.n;

  if (n1 < 2 || n2 < 2) {
    return { testType: 'T-Test', pValue: null, significant: false, details: 'Insufficient sample size (n<2)' };
  }

  // Welch's t-test formula
  const num = Math.abs(m1 - m2);
  const den = Math.sqrt((s1 * s1 / n1) + (s2 * s2 / n2));
  const t = num / den;

  // Degrees of freedom (Welch-Satterthwaite equation)
  const dfNum = Math.pow((s1 * s1 / n1) + (s2 * s2 / n2), 2);
  const dfDen = (Math.pow((s1 * s1 / n1), 2) / (n1 - 1)) + (Math.pow((s2 * s2 / n2), 2) / (n2 - 1));
  const df = dfNum / dfDen;

  // P-Value Calculation (Two-tailed)
  // P = 2 * (1 - CDF(|t|))
  // However, note that our betaInc based implementation above for studentT usually returns 1-tail area or similar
  // Let's use the Beta relation directly for P-value: P = betainc(df/(df+t^2), df/2, 0.5)
  const x = df / (df + t * t);
  const pValue = betainc(x, df / 2.0, 0.5);

  return {
    testType: 'T-Test',
    pValue,
    significant: pValue < 0.05,
    details: `t=${t.toFixed(4)}, df=${df.toFixed(2)}`
  };
};


export const performANOVA = (groups: StatsGroup[]): StatsResult => {
  // One-way ANOVA
  const k = groups.length;
  const N = groups.reduce((acc, g) => acc + g.n, 0);

  if (N - k <= 0 || k <= 1) {
       return { testType: 'ANOVA', pValue: null, significant: false, details: 'Insufficient data for ANOVA' };
  }

  // Grand Mean
  let sumAll = 0;
  groups.forEach(g => {
    sumAll += g.mean * g.n;
  });
  const grandMean = sumAll / N;

  // Sum of Squares Between (SSB)
  let ssb = 0;
  groups.forEach(g => {
    ssb += g.n * Math.pow(g.mean - grandMean, 2);
  });
  const dfBetween = k - 1;
  const msBetween = ssb / dfBetween;

  // Sum of Squares Within (SSW)
  let ssw = 0;
  groups.forEach(g => {
    // Reconstruct variance sum from SD
    // Variance = Sum(x-mean)^2 / (n-1) -> Sum(x-mean)^2 = Variance * (n-1)
    const variance = g.sd * g.sd;
    const sumSqDiff = variance * (g.n - 1);
    ssw += sumSqDiff;
  });
  const dfWithin = N - k;
  const msWithin = ssw / dfWithin;

  const fStat = msBetween / msWithin;

  // Calculate Exact P-Value for F-Statistic
  // P = 1 - CDF(F)
  const pValue = 1.0 - fDistCDF(fStat, dfBetween, dfWithin);

  // Bonferroni Post-hoc
  const comparisons: { group1: string; group2: string; pValue: number; significant: boolean }[] = [];
  const alpha = 0.05 / (k * (k - 1) / 2); // Bonferroni correction

  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const res = performTTest(groups[i], groups[j]);
      if (res.pValue !== null) {
        comparisons.push({
          group1: groups[i].name,
          group2: groups[j].name,
          pValue: res.pValue,
          significant: res.pValue < alpha
        });
      }
    }
  }

  return {
    testType: 'ANOVA',
    pValue: pValue, 
    significant: pValue < 0.05,
    details: `F=${fStat.toFixed(4)}, df1=${dfBetween}, df2=${dfWithin}, Post-hoc Bonferroni (α=${alpha.toFixed(4)})`,
    comparisons
  };
};
