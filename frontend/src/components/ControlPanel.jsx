import React from 'react';
import { 
  Sliders, 
  User, 
  Clock, 
  Cpu, 
  Minimize2, 
  UserCheck, 
  Calendar, 
  Play, 
  Wrench, 
  Loader2,
  Sparkles,
  Info
} from 'lucide-react';

export default function ControlPanel({
  patients = [],
  patientId,
  setPatientId,
  architecture = 'LSTM',
  setArchitecture,
  isQuantized,
  setIsQuantized,
  useAdapter,
  setUseAdapter,
  horizon,
  setHorizon,
  adaptationWindow,
  setAdaptationWindow,
  onRunForecast,
  onTriggerAdapt,
  isLoadingForecast,
  isAdapting
}) {
  const currentPatient = patients.find(p => p.patient_id === patientId) || patients[0];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Model Execution & Customization Control Panel
          </h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
          TinyML Interactive Controls
        </span>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* 1. Patient Selector Dropdown */}
        <div className="bg-slate-850/80 border border-slate-800 rounded-lg p-3 lg:col-span-2 flex flex-col justify-between">
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
              <User className="w-3.5 h-3.5 text-sky-400" /> Patient CGM Subject
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-medium rounded-lg px-3 py-2 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.name} [{p.dataset}]
                </option>
              ))}
            </select>
          </div>
          {currentPatient && (
            <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span>{currentPatient.gender}, {currentPatient.age} yrs</span>
              <span className="font-mono text-sky-400">Mean: {currentPatient.mean_cgm} mg/dL</span>
              <span className="font-mono text-emerald-400">TIR: {currentPatient.time_in_range_pct}%</span>
            </div>
          )}
        </div>

        {/* 2. Model Architecture Toggle (LSTM vs GRU) */}
        <div className="bg-slate-850/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <Cpu className="w-3.5 h-3.5 text-sky-400" /> Architecture
          </label>
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
            <button
              type="button"
              onClick={() => setArchitecture('LSTM')}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                architecture === 'LSTM'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              LSTM
            </button>
            <button
              type="button"
              onClick={() => setArchitecture('GRU')}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                architecture === 'GRU'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              GRU
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            {architecture === 'LSTM' ? '4 gates / ~2.8k params' : '3 gates / ~2.1k params'}
          </div>
        </div>

        {/* 3. INT8 Quantization Toggle (FP32 vs INT8 TFLite/CMSIS-NN) */}
        <div className="bg-slate-850/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <Minimize2 className="w-3.5 h-3.5 text-emerald-400" /> Quantization
          </label>
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
            <button
              type="button"
              onClick={() => setIsQuantized(false)}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                !isQuantized
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              FP32
            </button>
            <button
              type="button"
              onClick={() => setIsQuantized(true)}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                isQuantized
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              INT8
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            {isQuantized ? 'TFLite PTQ (3.8x memory saved)' : 'Full 32-bit float precision'}
          </div>
        </div>

        {/* 4. Personalization / Adapter Toggle (Global vs PEFT) */}
        <div className="bg-slate-850/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Personalization
          </label>
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
            <button
              type="button"
              onClick={() => setUseAdapter(false)}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                !useAdapter
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Global
            </button>
            <button
              type="button"
              onClick={() => setUseAdapter(true)}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                useAdapter
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              PEFT
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            {useAdapter ? 'Bottleneck adapter enabled' : 'Generic population model'}
          </div>
        </div>

        {/* 5. Forecast Horizon Selector (30-min vs 60-min) */}
        <div className="bg-slate-850/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> Horizon
          </label>
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
            <button
              type="button"
              onClick={() => setHorizon(30)}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                horizon === 30
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              30m
            </button>
            <button
              type="button"
              onClick={() => setHorizon(60)}
              className={`py-1.5 text-xs font-semibold rounded transition ${
                horizon === 60
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              60m
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            {horizon === 30 ? 'Short-term (6 steps)' : 'Long-term (12 steps)'}
          </div>
        </div>
      </div>

      {/* Adaptation Window Slider & Action Buttons */}
      <div className="bg-slate-850/60 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Adaptation Window Slider */}
        <div className="flex-1 min-w-[260px] max-w-md">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-400" /> Adaptation Data Window
            </label>
            <span className="text-xs font-bold font-mono text-purple-300">
              {adaptationWindow} {adaptationWindow === 1 ? 'Day' : 'Days'} ({adaptationWindow * 288} readings)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="1"
              max="14"
              step="1"
              value={adaptationWindow}
              onChange={(e) => {
                const val = Number(e.target.value);
                // Snap to 1, 3, 7, 14
                const allowed = [1, 3, 7, 14];
                const closest = allowed.reduce((prev, curr) => 
                  Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
                );
                setAdaptationWindow(closest);
              }}
              className="w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
            <span>1d (288 pts)</span>
            <span>3d (864 pts)</span>
            <span>7d (2,016 pts)</span>
            <span>14d (4,032 pts)</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRunForecast}
            disabled={isLoadingForecast}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition ${
              isLoadingForecast
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-sky-600 hover:bg-sky-500 text-white'
            }`}
          >
            {isLoadingForecast ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                Executing Pipeline...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Run Forecast
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onTriggerAdapt}
            disabled={isAdapting}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition ${
              isAdapting
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white'
            }`}
          >
            {isAdapting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                Adapting ({adaptationWindow}d)...
              </>
            ) : (
              <>
                <Wrench className="w-3.5 h-3.5" />
                Trigger On-Device Fine-Tuning
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
