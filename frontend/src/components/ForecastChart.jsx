import React from 'react';
import Plot from './PlotlyPlot';
import { Activity, Clock, Info } from 'lucide-react';

export default function ForecastChart({
  timestamps = [],
  groundTruth = [],
  predictions = [],
  mealEvents = [],
  bolusEvents = [],
  horizon = 30,
  architecture = 'LSTM',
  isQuantized = true,
  useAdapter = true,
  rmse = 15.0
}) {
  if (!timestamps || timestamps.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        Loading interactive continuous glucose forecast stream...
      </div>
    );
  }

  // Format timestamps for display
  const formattedTimes = timestamps.map(ts => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  });

  // Calculate error delta (Predicted - Ground Truth) and confidence bounds
  const errorDeltas = predictions.map((pred, idx) => {
    const gt = groundTruth[idx] !== undefined ? groundTruth[idx] : pred;
    return (pred - gt).toFixed(1);
  });

  const upperBounds = predictions.map(p => Math.round((p + 1.28 * (rmse || 12)) * 10) / 10);
  const lowerBounds = predictions.map(p => Math.max(40, Math.round((p - 1.28 * (rmse || 12)) * 10) / 10));

  // Trace 1: Lower Confidence Bound (invisible line for fill anchor)
  const traceLowerBound = {
    x: formattedTimes,
    y: lowerBounds,
    mode: 'lines',
    line: { width: 0, color: 'transparent' },
    showlegend: false,
    hoverinfo: 'skip'
  };

  // Trace 2: Upper Confidence Bound (shaded area between lower and upper)
  const traceUpperBound = {
    x: formattedTimes,
    y: upperBounds,
    mode: 'lines',
    fill: 'tonexty',
    fillcolor: 'rgba(239, 68, 68, 0.12)', // Soft red shaded risk area
    line: { width: 0, color: 'transparent' },
    name: `Confidence Risk Interval (±${(1.28 * (rmse || 12)).toFixed(1)} mg/dL)`,
    hoverinfo: 'skip'
  };

  // Trace 3: Ground Truth CGM readings (solid blue line with historical markers)
  const traceGroundTruth = {
    x: formattedTimes,
    y: groundTruth,
    mode: 'lines+markers',
    name: 'Ground Truth CGM (Reference)',
    marker: {
      size: 4,
      color: '#38bdf8' // Solid Blue
    },
    line: {
      color: '#38bdf8',
      width: 2.5
    },
    hovertemplate: 
      '<b>Ground Truth CGM</b><br>' +
      'Time: %{x}<br>' +
      'Glucose: <b>%{y:.1f} mg/dL</b>' +
      '<extra></extra>'
  };

  // Trace 4: Predicted Glucose Curve (dashed red line showing 30/60 min ahead)
  const tracePredictions = {
    x: formattedTimes,
    y: predictions,
    mode: 'lines+markers',
    name: `Predicted Curve (Dashed Red, +${horizon}m)`,
    marker: {
      size: 4,
      color: '#ef4444' // Red
    },
    line: {
      color: '#ef4444',
      width: 2.2,
      dash: 'dash'
    },
    customdata: errorDeltas,
    hovertemplate: 
      '<b>TinyML Forecast (+%{text}m)</b><br>' +
      'Time: %{x}<br>' +
      'Predicted: <b>%{y:.1f} mg/dL</b><br>' +
      'Error Delta (Δ): <b>%{customdata} mg/dL</b>' +
      '<extra></extra>',
    text: timestamps.map(() => horizon)
  };

  const traces = [traceLowerBound, traceUpperBound, traceGroundTruth, tracePredictions];

  // Optional Meal & Insulin traces if available
  if (mealEvents && mealEvents.length > 0) {
    const mealX = [];
    const mealY = [];
    const mealText = [];
    mealEvents.forEach(m => {
      const d = new Date(m.timestamp);
      mealX.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }));
      mealY.push(m.glucose);
      mealText.push(`Meal Event: ${m.meal_carbs}g Carbs`);
    });

    traces.push({
      x: mealX,
      y: mealY,
      mode: 'markers',
      name: 'Meal Intake (Carbs)',
      marker: {
        symbol: 'triangle-up',
        size: 11,
        color: '#22c55e',
        line: { color: '#ffffff', width: 1.2 }
      },
      text: mealText,
      hovertemplate: '<b>%{text}</b><br>Glucose: %{y:.1f} mg/dL<extra></extra>'
    });
  }

  // Target Glycemic Range Band (70 - 180 mg/dL)
  const shapes = [
    // Target Glycemic Range Shaded Green
    {
      type: 'rect',
      xref: 'paper',
      yref: 'y',
      x0: 0,
      y0: 70,
      x1: 1,
      y1: 180,
      fillcolor: 'rgba(16, 185, 129, 0.08)',
      line: { width: 0 },
      layer: 'below'
    },
    // Hypoglycemia boundary line (70 mg/dL)
    {
      type: 'line',
      xref: 'paper',
      yref: 'y',
      x0: 0,
      y0: 70,
      x1: 1,
      y1: 70,
      line: { color: 'rgba(239, 68, 68, 0.45)', width: 1.2, dash: 'dot' }
    },
    // Hyperglycemia boundary line (180 mg/dL)
    {
      type: 'line',
      xref: 'paper',
      yref: 'y',
      x0: 0,
      y0: 180,
      x1: 1,
      y1: 180,
      line: { color: 'rgba(245, 158, 11, 0.45)', width: 1.2, dash: 'dot' }
    }
  ];

  const layout = {
    autosize: true,
    height: 480,
    margin: { l: 55, r: 25, t: 25, b: 50 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(15, 23, 42, 0.65)',
    xaxis: {
      gridcolor: '#1e293b',
      tickfont: { color: '#94a3b8', size: 10 },
      tickangle: -20,
      nticks: 10,
      zeroline: false
    },
    yaxis: {
      title: { text: 'Interstitial Glucose (mg/dL)', font: { color: '#94a3b8', size: 12 } },
      range: [40, 360],
      dtick: 50,
      gridcolor: '#1e293b',
      tickfont: { color: '#94a3b8' },
      zeroline: false
    },
    shapes,
    legend: {
      orientation: 'h',
      y: 1.12,
      x: 0,
      font: { color: '#cbd5e1', size: 11 },
      bgcolor: 'rgba(0,0,0,0)'
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-base font-semibold text-white">
              Continuous Glucose Forecasting Stream (PH = {horizon} Min)
            </h3>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              {architecture} • {isQuantized ? 'INT8' : 'FP32'} • {useAdapter ? 'PEFT Adapted' : 'Global'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time comparison: Ground Truth CGM (solid blue) vs. Predicted Glucose Curve (dashed red) with shaded risk interval.
          </p>
        </div>

        {/* Legend Indicators */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-sky-400 inline-block"></span>
            <span className="text-slate-300">Ground Truth</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-b border-dashed border-red-500 inline-block"></span>
            <span className="text-slate-300">Predicted ({horizon}m)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded bg-red-500/20 border border-red-500/40 inline-block"></span>
            <span className="text-slate-400">Risk Bounds</span>
          </div>
        </div>
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

      {/* Footer Info */}
      <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-sky-400" />
          <span>
            Hover over any point to inspect Ground Truth, Predicted Glucose, and instant Error Delta ($\Delta$).
          </span>
        </div>
        <div className="font-mono text-slate-400">
          Historical Context: $t-11$ to $t$ (60 min) &bull; Horizon: $+{horizon}$ min
        </div>
      </div>
    </div>
  );
}
