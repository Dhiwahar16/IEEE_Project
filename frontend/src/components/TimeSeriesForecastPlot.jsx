import React from 'react';
import Plot from './PlotlyPlot';
import { Activity, Utensils, Syringe, AlertTriangle, Info } from 'lucide-react';

export default function TimeSeriesForecastPlot({
  timestamps = [],
  groundTruth = [],
  predictions = [],
  mealEvents = [],
  bolusEvents = [],
  horizonMins = 30,
  architecture = 'LSTM',
  isQuantized = true,
  isAdapted = true
}) {
  if (!timestamps || timestamps.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 text-center text-slate-400">
        Loading time-series forecast stream...
      </div>
    );
  }

  // Format dates for readable x-axis
  const formattedTimes = timestamps.map(ts => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  });

  // Trace 1: Ground Truth Reference Glucose
  const traceGroundTruth = {
    x: formattedTimes,
    y: groundTruth,
    mode: 'lines',
    name: 'Ground Truth CGM (mg/dL)',
    line: {
      color: '#38bdf8', // Sky Blue
      width: 2.5
    },
    hovertemplate: '<b>Ground Truth</b>: %{y:.1f} mg/dL<br>Time: %{x}<extra></extra>'
  };

  // Trace 2: Predicted TinyML Glucose
  const tracePredictions = {
    x: formattedTimes,
    y: predictions,
    mode: 'lines',
    name: `Predicted TinyML (${architecture} ${isQuantized ? 'INT8' : 'FP32'}${isAdapted ? ' + Adapter' : ''})`,
    line: {
      color: isAdapted ? '#a855f7' : '#f59e0b', // Purple if adapted, Amber if global
      width: 2.2,
      dash: 'dash'
    },
    hovertemplate: '<b>TinyML Forecast</b>: %{y:.1f} mg/dL<extra></extra>'
  };

  // Trace 3: Meal Events
  const mealTimes = [];
  const mealGlucose = [];
  const mealTexts = [];
  mealEvents.forEach(m => {
    const d = new Date(m.timestamp);
    mealTimes.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }));
    mealGlucose.push(m.glucose);
    mealTexts.push(`Meal: ${m.meal_carbs}g Carbs`);
  });

  const traceMeals = {
    x: mealTimes,
    y: mealGlucose,
    mode: 'markers',
    name: 'Meal Intake (Carbs)',
    marker: {
      symbol: 'triangle-up',
      size: 11,
      color: '#22c55e',
      line: { color: '#ffffff', width: 1.2 }
    },
    text: mealTexts,
    hovertemplate: '<b>%{text}</b><br>Glucose: %{y:.1f} mg/dL<extra></extra>'
  };

  // Trace 4: Insulin Boluses
  const bolusTimes = [];
  const bolusGlucose = [];
  const bolusTexts = [];
  bolusEvents.forEach(b => {
    const d = new Date(b.timestamp);
    bolusTimes.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }));
    bolusGlucose.push(b.glucose);
    bolusTexts.push(`Bolus: ${b.bolus_insulin} U`);
  });

  const traceBoluses = {
    x: bolusTimes,
    y: bolusGlucose,
    mode: 'markers',
    name: 'Insulin Bolus (U)',
    marker: {
      symbol: 'diamond',
      size: 9,
      color: '#f43f5e',
      line: { color: '#ffffff', width: 1 }
    },
    text: bolusTexts,
    hovertemplate: '<b>%{text}</b><br>Glucose: %{y:.1f} mg/dL<extra></extra>'
  };

  const traces = [traceGroundTruth, tracePredictions];
  if (mealTimes.length > 0) traces.push(traceMeals);
  if (bolusTimes.length > 0) traces.push(traceBoluses);

  // Glycemic Target Range Band (70 - 180 mg/dL)
  const shapes = [
    // Target Glycemic Range 70 - 180 mg/dL Shaded Green
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
    // Hypoglycemia boundary (70 mg/dL)
    {
      type: 'line',
      xref: 'paper',
      yref: 'y',
      x0: 0,
      y0: 70,
      x1: 1,
      y1: 70,
      line: { color: 'rgba(239, 68, 68, 0.4)', width: 1.2, dash: 'dot' }
    },
    // Hyperglycemia boundary (180 mg/dL)
    {
      type: 'line',
      xref: 'paper',
      yref: 'y',
      x0: 0,
      y0: 180,
      x1: 1,
      y1: 180,
      line: { color: 'rgba(245, 158, 11, 0.4)', width: 1.2, dash: 'dot' }
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">Time-Series Continuous Glucose Forecasting</h3>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              PH = {horizonMins} Minutes
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Streaming comparison of Ground Truth CGM vs TinyML forecast with synchronized meal carbs and insulin boluses.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500 inline-block"></span>
            <span className="text-slate-400">Target Range (70-180 mg/dL)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rotate-45 bg-rose-500 inline-block"></span>
            <span className="text-slate-400">Insulin Bolus</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-emerald-500 border border-white inline-block clip-triangle"></span>
            <span className="text-slate-400">Meal Events</span>
          </div>
        </div>
      </div>

      <div className="w-full">
        <Plot
          data={traces}
          layout={layout}
          useResizeHandler={true}
          style={{ width: '100%', height: '480px' }}
          config={{ responsive: true, displayModeBar: false }}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-sky-400" />
          <span>
            Sliding window: 60 min historical context (t-11 to t) projecting {horizonMins}-min forward horizon.
          </span>
        </div>
        <div className="font-mono text-slate-400">
          Sample resolution: 5-minute epochs (288 steps/day)
        </div>
      </div>
    </div>
  );
}
