import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  Layers, 
  ShieldCheck, 
  BarChart3, 
  Table, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  Info
} from 'lucide-react';

import { fetchPatients, runPrediction, triggerAdaptation, fetchBenchmarks } from '../api';
import ControlPanel from './ControlPanel';
import ResourceMetricsPanel from './ResourceMetricsPanel';
import ForecastChart from './ForecastChart';
import ClarkeErrorGrid from './ClarkeErrorGrid';
import TradeoffChart from './TradeoffChart';

export default function ForecastDashboard() {
  // State variables specified in Phase 2
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('subject_559');
  const [architecture, setArchitecture] = useState('LSTM');
  const [isQuantized, setIsQuantized] = useState(true);
  const [useAdapter, setUseAdapter] = useState(true);
  const [horizon, setHorizon] = useState(30);
  const [adaptationWindow, setAdaptationWindow] = useState(7);

  // Data & execution state
  const [predictionData, setPredictionData] = useState(null);
  const [benchmarksData, setBenchmarksData] = useState(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);
  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptationResult, setAdaptationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('clarke'); // 'clarke', 'tradeoff', 'table'
  const [errorMsg, setErrorMsg] = useState(null);

  // 1. Fetch initial patient list on mount
  useEffect(() => {
    loadPatients();
  }, []);

  // 2. Fetch initial prediction & benchmarks when patientId is ready, and update when toggles change
  useEffect(() => {
    if (patientId) {
      handleExecuteForecast();
      loadBenchmarks();
    }
  }, [patientId, architecture, isQuantized, useAdapter, horizon, adaptationWindow]);

  const loadPatients = async () => {
    try {
      const patientList = await fetchPatients();
      setPatients(patientList);
      if (patientList.length > 0 && !patientId) {
        setPatientId(patientList[0].patient_id);
      }
    } catch (err) {
      console.error('Failed to load patients:', err);
      setErrorMsg('Unable to connect to FastAPI backend at http://127.0.0.1:8000. Ensure the server is running.');
    }
  };

  const handleExecuteForecast = async () => {
    if (!patientId) return;
    setIsLoadingForecast(true);
    setErrorMsg(null);
    try {
      const data = await runPrediction({
        patientId,
        architecture,
        isQuantized,
        useAdapter,
        horizon,
        windowDays: adaptationWindow,
      });
      setPredictionData(data);
    } catch (err) {
      console.error('Prediction pipeline error:', err);
      const detail = err.response?.data?.detail || err.message || 'Error executing TinyML inference pipeline';
      setErrorMsg(detail);
    } finally {
      setIsLoadingForecast(false);
    }
  };

  const handleTriggerAdaptation = async () => {
    if (!patientId) return;
    setIsAdapting(true);
    setAdaptationResult(null);
    try {
      const result = await triggerAdaptation({
        patientId,
        architecture,
        horizon,
        windowDays: adaptationWindow,
        epochs: 20,
      });
      setAdaptationResult(result);
      // Automatically switch to Adapted model and refresh
      setUseAdapter(true);
      await handleExecuteForecast();
      await loadBenchmarks();
    } catch (err) {
      console.error('Adaptation failed:', err);
      alert('On-Device Fine-Tuning Error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsAdapting(false);
    }
  };

  const loadBenchmarks = async () => {
    if (!patientId) return;
    try {
      const data = await fetchBenchmarks(patientId, adaptationWindow, horizon);
      setBenchmarksData(data);
    } catch (err) {
      console.error('Failed to load benchmarks:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 lg:p-8 space-y-6">
      {/* Workbench Header */}
      <header className="border-b border-slate-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                IEEE EMBS / TinyML Research Workbench
              </span>
              <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Backend Online (FastAPI)
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1.5">
              Resource-Efficient Patient-Specific Adaptation for TinyML-Based CGM Glucose Forecasting
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1 max-w-4xl">
              Interactive workbench analyzing INT8 quantized recurrent models (LSTM / GRU) personalized via Parameter-Efficient Fine-Tuning (PEFT / Bottleneck Adapters) on OhioT1DM & OpenAPS continuous glucose monitoring streams.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { handleExecuteForecast(); loadBenchmarks(); }}
              disabled={isLoadingForecast}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingForecast ? 'animate-spin text-sky-400' : ''}`} />
              Refresh Analytics
            </button>
          </div>
        </div>
      </header>

      {/* Error Alert Banner */}
      {errorMsg && (
        <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 text-xs text-rose-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <span className="font-bold text-white">System Error:</span> {errorMsg}
            </div>
          </div>
          <button
            onClick={handleExecuteForecast}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded text-xs transition"
          >
            Retry Request
          </button>
        </div>
      )}

      {/* Adaptation Success Toast */}
      {adaptationResult && (
        <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-3.5 text-xs text-slate-300 flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">PEFT Adaptation Complete:</span>{' '}
              Fine-tuned bottleneck adapter in <span className="font-mono text-sky-300">{adaptationResult.training_duration_sec}s</span> across{' '}
              <span className="font-mono text-purple-300">{adaptationResult.steps_trained} historical steps</span>. Updated only{' '}
              <span className="font-bold text-emerald-400 font-mono">{adaptationResult.trainable_parameters} weights (~{adaptationResult.adapter_memory_overhead_kb} KB)</span>!
            </div>
          </div>
          <div className="font-mono text-emerald-400 font-bold whitespace-nowrap">
            Personalized RMSE: {adaptationResult.metrics.rmse} mg/dL (Zone A: {adaptationResult.clarke_zones.A}%)
          </div>
        </div>
      )}

      {/* Component 1: Control Panel */}
      <section>
        <ControlPanel
          patients={patients}
          patientId={patientId}
          setPatientId={setPatientId}
          architecture={architecture}
          setArchitecture={setArchitecture}
          isQuantized={isQuantized}
          setIsQuantized={setIsQuantized}
          useAdapter={useAdapter}
          setUseAdapter={setUseAdapter}
          horizon={horizon}
          setHorizon={setHorizon}
          adaptationWindow={adaptationWindow}
          setAdaptationWindow={setAdaptationWindow}
          onRunForecast={handleExecuteForecast}
          onTriggerAdapt={handleTriggerAdaptation}
          isLoadingForecast={isLoadingForecast}
          isAdapting={isAdapting}
        />
      </section>

      {/* Component 2: Resource Metrics Panel */}
      <section>
        <ResourceMetricsPanel
          metrics={predictionData?.hardware_metrics}
          isQuantized={isQuantized}
          useAdapter={useAdapter}
          architecture={architecture}
        />
      </section>

      {/* Component 3: Forecast Chart (Plotly.js) */}
      <section>
        <ForecastChart
          timestamps={predictionData?.timestamps || []}
          groundTruth={predictionData?.ground_truth || []}
          predictions={predictionData?.predictions || []}
          mealEvents={predictionData?.meal_events || []}
          bolusEvents={predictionData?.bolus_events || []}
          horizon={horizon}
          architecture={architecture}
          isQuantized={isQuantized}
          useAdapter={useAdapter}
          rmse={predictionData?.hardware_metrics?.rmse || 14.5}
        />
      </section>

      {/* Component 4 & 5: Clinical Analytics Tabs (Clarke Error Grid & Trade-off Bar Chart) */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Clinical Safety & Embedded Trade-off Benchmarks
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Explore Clarke Error Grid Analysis (EGA) and multi-model resource vs accuracy comparisons.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('clarke')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'clarke'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Clarke Error Grid (Zones A-E)
            </button>
            <button
              onClick={() => setActiveTab('tradeoff')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'tradeoff'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Accuracy vs. Resource Trade-off
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Table className="w-3.5 h-3.5" /> Full Benchmark Matrix
            </button>
          </div>
        </div>

        {/* Tab 1: Clarke Error Grid */}
        {activeTab === 'clarke' && (
          <ClarkeErrorGrid
            groundTruth={predictionData?.ground_truth || []}
            predictions={predictionData?.predictions || []}
            clarkeAnalysis={predictionData?.clarke_analysis}
          />
        )}

        {/* Tab 2: Trade-off Bar Chart */}
        {activeTab === 'tradeoff' && (
          <TradeoffChart benchmarks={benchmarksData?.benchmarks || []} />
        )}

        {/* Tab 3: Detailed Table */}
        {activeTab === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Configuration</th>
                  <th className="py-2.5 px-3">Precision</th>
                  <th className="py-2.5 px-3">Personalization</th>
                  <th className="py-2.5 px-3">RMSE (mg/dL)</th>
                  <th className="py-2.5 px-3">MAE (mg/dL)</th>
                  <th className="py-2.5 px-3">MARD (%)</th>
                  <th className="py-2.5 px-3">Zone A (%)</th>
                  <th className="py-2.5 px-3">Flash (KB)</th>
                  <th className="py-2.5 px-3">RAM Arena (KB)</th>
                  <th className="py-2.5 px-3">Latency M4 (ms)</th>
                  <th className="py-2.5 px-3">Energy M4 (mJ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(benchmarksData?.benchmarks || []).map((b, idx) => {
                  const isCurrent = 
                    b.architecture === architecture &&
                    b.quantization === (isQuantized ? 'INT8' : 'FP32') &&
                    ((useAdapter && b.adaptation.includes('Adapted')) ||
                     (!useAdapter && b.adaptation === 'Global'));

                  return (
                    <tr 
                      key={idx} 
                      className={`hover:bg-slate-850/80 transition ${isCurrent ? 'bg-indigo-950/30 border-l-2 border-indigo-400' : ''}`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-1.5">
                        {isCurrent && <span className="w-2 h-2 rounded-full bg-indigo-400"></span>}
                        {b.label}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${b.quantization === 'INT8' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          {b.quantization}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{b.adaptation}</td>
                      <td className="py-2.5 px-3 font-bold text-rose-400">{b.rmse}</td>
                      <td className="py-2.5 px-3 text-slate-300">{b.mae}</td>
                      <td className="py-2.5 px-3 text-purple-400">{b.mard_pct}%</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">{b.zone_a_pct}%</td>
                      <td className="py-2.5 px-3 font-bold text-sky-400">{b.flash_kb}</td>
                      <td className="py-2.5 px-3 text-indigo-400">{b.ram_arena_kb}</td>
                      <td className="py-2.5 px-3 text-amber-400">{b.latency_m4_ms}</td>
                      <td className="py-2.5 px-3 text-emerald-400">{b.energy_m4_mj}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="pt-6 border-t border-slate-900 text-center text-xs text-slate-400 space-y-1">
        <p className="font-medium text-slate-300">
          Resource-Efficient Patient-Specific Adaptation for TinyML-Based CGM Glucose Forecasting
        </p>
        <p className="text-[11px] text-slate-400">
          Frontend: React.js + Plotly.js + Tailwind CSS + Axios &bull; Backend: FastAPI + PyTorch + SQLite3
        </p>
      </footer>
    </div>
  );
}
