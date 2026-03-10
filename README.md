# Yeast Doubling Time (DT) Calculator 🧫

![React](https://img.shields.io/badge/React-19.2.0-blue?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-6.2.0-purple?style=for-the-badge&logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

A specialized, web-based bioinformatics tool for calculating yeast doubling times from Biotech Epoch2 plate reader data. This application provides a user-friendly graphical interface for growth kinetics analysis from yeast (OD vs time).

## Features

- **Automated Data Parsing:** Seamlessly import and parse raw output files (`.txt`, `.csv`, `.xls`, `.xlsx`) directly from Biotech Epoch2 plate readers (other plate readers may be compatable, see below).
- **Interactive Growth Curves:** Visualize OD (Optical Density) over time for individual wells or grouped replicates using interactive charts.
- **Dynamic Configuration:** Adjust calculation parameters on the fly, including exponential phase thresholds (Low OD / High OD), time intervals, and header row skipping.
- **Plate Layout Mapping:** Paste custom plate layouts to automatically name wells, group replicates, and identify blank wells for background subtraction.
- **Comprehensive Analytics:** 
  - **Detail View:** Tabular breakdown of doubling time, growth rate, and R² values for every well.
  - **Plate Overview:** A 96-well or 384-well heatmap-style grid for quick spatial analysis of growth patterns.
  - **Stats View:** Aggregate statistics and comparative charts for grouped samples.
- **Export Ready:** Export processed data and high-quality charts for publications or lab notebooks.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/yeast-dt-calculator.git
   cd yeast-dt-calculator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`.

## 🗂️ File Input Structure

To ensure successful data extraction, your input file (`.csv`, `.txt`, `.xls`, or `.xlsx`) must contain a specific data table structure. The app is designed to handle standard Biotech Epoch2 outputs, but other platereader data may be directly compatable:

1. **Metadata (The "Crop"):** The top rows of the file usually contain experiment metadata. The parser will automatically skip these rows (configurable via the **Skip Rows** setting, defaulting to 25-26 rows) or attempt to auto-detect where the data begins.
2. **The Header Row (Crucial):** Immediately after the skipped metadata rows, the top row of your actual data table **must** be a header row. 
   - This row needs to be labeled with exact well positions (e.g., `A1`, `A2`, `B1`, etc.) for every column containing OD readings.
   - It should also typically contain a `Time` column.
3. **Data Rows:** 
   - The first column typically contains the timestamp of the reading. *(Note: The app calculates actual elapsed time using the **Interval** setting in the configuration panel, rather than parsing the exact timestamp string).*
   - The subsequent columns must contain the numeric Optical Density (OD) readings corresponding to each well label in the header.

**Example of the Data Table (After skipping metadata):**
| Time    | T° 600 | A1    | A2    | A3    | ... |
|---------|--------|-------|-------|-------|-----|
| 0:00:00 | 30.0   | 0.081 | 0.085 | 0.079 | ... |
| 0:30:00 | 30.0   | 0.092 | 0.096 | 0.088 | ... |
| 1:00:00 | 30.0   | 0.115 | 0.120 | 0.105 | ... |

## Doubling Time Calculations

The application calculates the Doubling Time (DT) using two distinct methods to provide a comprehensive view of the growth kinetics. Both methods rely on the fundamental exponential growth equation, where the doubling time is calculated as `DT = ln(2) / slope`.

### 1. DT Interval (Average)
This method calculates the average doubling time across the entire user-defined exponential growth phase.
- **Data Filtering:** The algorithm first filters the data points for a specific well, keeping only the OD readings that fall strictly between the **Lower OD Limit** and **Upper OD Limit** configured in the sidebar.
- **Log Transformation:** It takes the natural logarithm (`ln`) of these filtered OD values.
- **Linear Regression:** A standard least-squares linear regression is performed on the log-transformed OD values against time. 
- **Calculation:** The slope of this regression line represents the average specific growth rate (μ) during that interval. The doubling time is then calculated as `ln(2) / slope`.

### 2. DT Inflection (Max Rate)
This method identifies the maximum growth rate (the steepest slope) achieved *within* the defined OD limits, representing the point of fastest exponential growth.
- **Sliding Window:** The algorithm uses a sliding window of 4 consecutive data points.
- **Scanning:** It scans this window across all data points that fall within the **Lower OD Limit** and **Upper OD Limit**.
- **Local Regression:** For each 4-point window, it performs a linear regression on the log-transformed OD values against time.
- **Maximum Slope:** It identifies the window that produced the highest positive slope (the maximum growth rate).
- **Calculation:** The doubling time is calculated using this maximum slope: `ln(2) / max_slope`.

## Statistical Analysis

When you apply a plate layout with named replicates, the application automatically groups identical names and performs robust statistical analysis in the **Stats View**.

### Descriptive Statistics
For each named group, the app calculates:
- **Mean (Average):** The average doubling time across all valid replicates in the group.
- **Standard Deviation (SD):** The measure of the amount of variation or dispersion of the replicates.
- **Sample Size (n):** The number of valid replicates successfully analyzed.

### Inferential Statistics
To help you determine if differences between your yeast strains or conditions are statistically significant, the app automatically selects and runs the appropriate statistical test:

- **Welch's T-Test (2 Groups):** If exactly two groups are selected for comparison, the app performs a two-tailed Welch's t-test. This test is more reliable than a standard Student's t-test when the two samples have unequal variances and/or unequal sample sizes.
- **One-way ANOVA (3+ Groups):** If three or more groups are selected, the app performs a One-way Analysis of Variance (ANOVA) to determine if there are any statistically significant differences between the means of the independent groups.
- **Post-hoc Bonferroni Correction:** When an ANOVA is performed, the app automatically conducts pairwise Welch's t-tests between all groups, applying a Bonferroni correction to the alpha level (α = 0.05 / number of comparisons) to strictly control for Type I errors (false positives) during multiple comparisons.

*Note: Statistical significance is evaluated at a standard alpha level of 0.05.*

## 📖 Usage Guide

### 1. Upload Data
Drag and drop your platereader output file into the upload zone, or click to browse. The app automatically detects if the file is a binary Excel file or a text/CSV file and adjusts the default parsing rules accordingly.

### 2. Configure Parameters
Fine-tune the processing configuration in the sidebar:
- **Skip Rows:** The number of metadata rows to ignore before the actual time-series data begins (defaults to 25 for TXT/CSV, 26 for Excel).
- **Time Interval (mins):** The time elapsed between each plate reader measurement.
- **Low OD / High OD:** The optical density boundaries defining the exponential growth phase. The algorithm calculates the doubling time using data points strictly within this window.
- **Blank Wells:** Comma-separated list of wells (e.g., `A1, A2, B1`) to use for background OD subtraction.

### 3. Apply Plate Layout (Optional but Recommended)
Paste a grid of sample names corresponding to your physical plate layout. 
- Naming a well `blank` will automatically add it to the Blank Wells configuration.
- Wells with identical names are automatically grouped as replicates in the Stats View.

**Example Plate Layout Input (Tab-separated, e.g., copied from Excel):**
```text
blank	blank	blank	blank	blank	blank
WT	WT	WT	MutA	MutA	MutA
MutB	MutB	MutB	MutC	MutC	MutC
...
```
*(Note: The top-left cell corresponds to well A1, the next cell to A2, etc. The input supports both 96-well (8x12) and 384-well (16x24) formats).*

### 4. Analyze Results
Navigate between the three main views:
- **Detail Tab:** Review the calculated Doubling Time (DT) and inspect the growth curve for any specific well.
- **Plate Tab:** View the entire plate at a glance to spot spatial anomalies, edge effects, or contamination.
- **Stats Tab:** Compare averaged growth curves and statistical summaries across your named sample groups.

## Tech Stack

- **Frontend Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Charting:** [Recharts](https://recharts.org/)
- **Data Parsing:** [SheetJS (xlsx)](https://sheetjs.com/)
- **Exporting:** [html2canvas](https://html2canvas.hertzen.com/)

## 📁 Project Structure

```text
├── components/          # Reusable React components
│   ├── GrowthChart.tsx  # Recharts implementation for growth curves
│   ├── PlateOverview.tsx# 96/384-well grid visualization
│   ├── ResultsTable.tsx # Tabular data display
│   └── StatsView.tsx    # Aggregate statistics and grouping logic
├── utils/               # Core business logic and math
│   ├── fileProcessor.ts # Epoch2 file parsing and data extraction
│   ├── mathUtils.ts     # Exponential regression and DT math
│   └── statsUtils.ts    # Replicate grouping and statistical analysis
├── types.ts             # TypeScript interfaces and types
├── App.tsx              # Main application state and layout
├── index.css            # Global Tailwind styles
└── vite.config.ts       # Vite configuration
```

## Contributing

Contributions are welcome! Whether you're fixing a bug, adding a feature, or improving documentation, please feel free to open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Disclosures
AI (google gemini pro / GoogleAI studio was used to build this software and the readme)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
