import React from 'react';
import Plot from './PlotlyPlot';
import { ShieldCheck, AlertTriangle, Info } from 'lucide-react';

export default function ClarkeErrorGrid({
  groundTruth = [],
  predictions = [],
  clarkeAnalysis = null
}) {
  const counts = clarkeAnalysis?.counts || { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const percentages = clarkeAnalysis?.percentages || { A: 100, B: 0, C: 0, D: 0, E: 0 };
  const zoneLabels = clarkeAnalysis?.zone_labels || [];

  // Exact Phase 2 Color Specification:
  // Zone A = Green, Zone B = Yellow, Zones C/D/E = Red
  const zoneColors = {
    A: '#10b981', // Green (Clinically Accurate)
    B: '#eab308', // Yellow (Benign / Safe Errors)
    C: '#f97316', // Orange-Red (Overcorrection)
    D: '#ef4444', // Red (Failure to Detect Hypo/Hyper)
    E: '#dc2626'  // Deep Red (Erroneous Treatment / Hazard)
  };

  // Group data points by Zone
  const pointsByZone = {
    A: { x: [], y: [] },
    B: { x: [], y: [] },
    C: { x: [], y: [] },
    D: { x: [], y: [] },
    E: { x: [], y: [] }
  };

  for (let i = 0; i < groundTruth.length; i++) {
    const z = zoneLabels[i] || 'A';
    if (pointsByZone[z]) {
      pointsByZone[z].x.push(groundTruth[i]);
      pointsByZone[z].y.push(predictions[i]);
    }
  }

  // Scatter traces for each Zone
  const traces = Object.keys(pointsByZone).map((z) => ({
    x: pointsByZone[z].x,
    y: pointsByZone[z].y,
    mode: 'markers',
    type: 'scatter',
    name: `Zone ${z} (${percentages[z]}%)`,
    marker: {
      color: zoneColors[z],
      size: 6,
      opacity: 0.85,
      line: {
        color: '#0f172a',
        width: 0.5
      }
    },
    hovertemplate: `<b>Zone ${z}</b><br>Reference: %{x:.1f} mg/dL<br>Predicted: %{y:.1f} mg/dL<extra></extra>`
  }));

  // Ideal reference diagonal line (y = x)
  traces.unshift({
    x: [0, 400],
    y: [0, 400],
    mode: 'lines',
    type: 'scatter',
    name: 'Ideal (y = x)',
    line: {
      color: '#94a3b8',
      width: 1.5,
      dash: 'dash'
    },
    hoverinfo: 'none',
    showlegend: false
  });

  // Clarke Grid Boundary Shapes & Region Overlays
  const shapes = [
    // Background Region Overlay for Zone E (Upper Left Box: x <= 70, y >= 180)
    {
      type: 'rect',
      x0: 0,
      y0: 180,
      x1: 70,
      y1: 400,
      fillcolor: 'rgba(220, 38, 38, 0.12)', // Red
      line: { color: 'rgba(220, 38, 38, 0.45)', width: 1 }
    },
    // Background Region Overlay for Zone E (Lower Right Box: x >= 180, y <= 70)
    {
      type: 'rect',
      x0: 180,
      y0: 0,
      x1: 400,
      y1: 70,
      fillcolor: 'rgba(220, 38, 38, 0.12)', // Red
      line: { color: 'rgba(220, 38, 38, 0.45)', width: 1 }
    },
    // Zone A 20% upper line: y = 1.2 x
    {
      type: 'line',
      x0: 58.33,
      y0: 70,
      x1: 333.33,
      y1: 400,
      line: { color: 'rgba(16, 185, 129, 0.4)', width: 1.2, dash: 'dot' } // Green
    },
    // Zone A 20% lower line: y = 0.8 x
    {
      type: 'line',
      x0: 70,
      y0: 56,
      x1: 400,
      y1: 320,
      line: { color: 'rgba(16, 185, 129, 0.4)', width: 1.2, dash: 'dot' } // Green
    },
    // Zone A Hypo square boundary
    {
      type: 'line',
      x0: 0,
      y0: 70,
      x1: 70,
      y1: 70,
      line: { color: 'rgba(16, 185, 129, 0.4)', width: 1.2, dash: 'dot' }
    },
    {
      type: 'line',
      x0: 70,
      y0: 0,
      x1: 70,
      y1: 70,
      line: { color: 'rgba(16, 185, 129, 0.4)', width: 1.2, dash: 'dot' }
    },
    // Zone B / C upper boundary: y = x + 110
    {
      type: 'line',
      x0: 70,
      y0: 180,
      x1: 290,
      y1: 400,
      line: { color: 'rgba(234, 179, 8, 0.5)', width: 1.2 } // Yellow
    },
    // Zone B / C lower boundary: y = 0.8x - 110
    {
      type: 'line',
      x0: 130,
      y0: 0,
      x1: 180,
      y1: 70,
      line: { color: 'rgba(234, 179, 8, 0.5)', width: 1.2 } // Yellow
    },
    // Zone D Hypo boundary: y = 70 (x >= 70 to 240)
    {
      type: 'line',
      x0: 70,
      y0: 70,
      x1: 240,
      y1: 70,
      line: { color: 'rgba(239, 68, 68, 0.5)', width: 1.2 } // Red
    },
    // Zone D Hyper boundary: x = 240 (y <= 70 to 180)
    {
      type: 'line',
      x0: 240,
      y0: 70,
      x1: 240,
      y1: 180,
      line: { color: 'rgba(239, 68, 68, 0.5)', width: 1.2 } // Red
    }
  ];

  const annotations = [
    { x: 35, y: 35, text: '<b>A</b>', showarrow: false, font: { color: '#10b981', size: 16 } },
    { x: 340, y: 360, text: '<b>A</b>', showarrow: false, font: { color: '#10b981', size: 16 } },
    { x: 260, y: 360, text: '<b>B</b>', showarrow: false, font: { color: '#eab308', size: 15 } },
    { x: 365, y: 250, text: '<b>B</b>', showarrow: false, font: { color: '#eab308', size: 15 } },
    { x: 140, y: 340, text: '<b>C</b>', showarrow: false, font: { color: '#f97316', size: 14 } },
    { x: 160, y: 40, text: '<b>C</b>', showarrow: false, font: { color: '#f97316', size: 14 } },
    { x: 160, y: 85, text: '<b>D</b>', showarrow: false, font: { color: '#ef4444', size: 14 } },
    { x: 35, y: 280, text: '<b>E</b>', showarrow: false, font: { color: '#dc2626', size: 15 } },
    { x: 280, y: 35, text: '<b>E</b>', showarrow: false, font: { color: '#dc2626', size: 15 } }
  ];

  const layout = {
    autosize: true,
    height: 480,
    margin: { l: 55, r: 25, t: 30, b: 50 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(15, 23, 42, 0.65)',
    xaxis: {
      title: { text: 'Reference Blood Glucose (mg/dL)', font: { color: '#94a3b8', size: 12 } },
      range: [0, 400],
      dtick: 50,
      gridcolor: '#1e293b',
      tickfont: { color: '#94a3b8' },
      zeroline: false
    },
    yaxis: {
      title: { text: 'TinyML Predicted Glucose (mg/dL)', font: { color: '#94a3b8', size: 12 } },
      range: [0, 400],
      dtick: 50,
      gridcolor: '#1e293b',
      tickfont: { color: '#94a3b8' },
      zeroline: false
    },
    shapes,
    annotations,
    legend: {
      orientation: 'h',
      y: 1.12,
      x: 0,
      font: { color: '#cbd5e1', size: 11 },
      bgcolor: 'rgba(0,0,0,0)'
    }
  };

  const isSafe = (percentages.A + (percentages.B || 0)) >= 95.0;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
      <div>
        {/* Header & Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Clarke Error Grid Analysis (EGA)</h3>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1 ${
                isSafe 
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}>
                {isSafe ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {isSafe ? 'Clinically Safe (A + B ≥ 95%)' : 'Caution Required'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Scatter plot mapping Predicted (Y) vs Reference (X) glucose into clinical risk zones (Zone A = Green, Zone B = Yellow, Zones C/D/E = Red).
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400">Total Evaluated Points:</span>
            <span className="ml-1.5 font-bold font-mono text-sky-400">{groundTruth.length}</span>
          </div>
        </div>

        {/* Zone Breakdown Pill Grid */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          {['A', 'B', 'C', 'D', 'E'].map((z) => (
            <div 
              key={z} 
              className="bg-slate-850/80 border border-slate-800 rounded-lg p-2.5 text-center"
              style={{ borderLeftColor: zoneColors[z], borderLeftWidth: '3.5px' }}
            >
              <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-center gap-1">
                Zone {z}
              </div>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {percentages[z]}%
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {counts[z]} pts
              </div>
            </div>
          ))}
        </div>

        {/* Plotly Chart */}
        <div className="w-full">
          <Plot
            data={traces}
            layout={layout}
            useResizeHandler={true}
            style={{ width: '100%', height: '480px' }}
            config={{ responsive: true, displayModeBar: false }}
          />
        </div>
      </div>

      {/* Clinical Interpretation Guide Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-300">Clinical Risk Significance:</span>{' '}
          <strong className="text-emerald-400">Zone A (Green)</strong> indicates values within 20% of reference glucose. <strong className="text-yellow-400">Zone B (Yellow)</strong> contains benign errors that do not lead to inappropriate intervention. <strong className="text-red-400">Zones C, D, and E (Red)</strong> represent overcorrection, missed hypoglycemia/hyperglycemia, and severe treatment reversals.
        </div>
      </div>
    </div>
  );
}
