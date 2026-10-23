import React from 'react';
import { 
  Cpu, 
  HardDrive, 
  Zap, 
  Gauge, 
  Activity, 
  Layers, 
  TrendingDown, 
  Clock, 
  CheckCircle2, 
  Sparkles 
} from 'lucide-react';

export default function MetricsPanel({ metrics, isQuantized, isAdapted, architecture }) {
  if (!metrics) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 text-center text-slate-400">
        Loading embedded hardware footprint metrics...
      </div>
    );
  }

  const {
    flash_footprint_kb = 0,
    ram_arena_kb = 0,
    latency_cortex_m4_ms = 0,
    latency_esp32_ms = 0,
    energy_cortex_m4_mj = 0,
    energy_esp32_mj = 0,
    rmse = 0,
    mae = 0,
    mard_pct = 0,
    total_parameters = 0,
    trainable_parameters = 0,
    trainable_ratio_pct = 100
  } = metrics;

  return (
    <div className="space-y-4">
      {/* Top Banner: Edge Device Feasibility Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800/80 rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Target MCU Deployment</span>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Compatible: ARM Cortex-M4 & ESP32
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Profiles ultra-low-power CGM wearable transmitter (e.g., nRF52840 / STM32F401, 64MHz, &lt;64KB SRAM).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-slate-400">Backbone Architecture:</span>
            <span className="ml-1.5 font-bold text-sky-400 font-mono">{architecture} (24 Hidden)</span>
          </div>
          <div>
            <span className="text-slate-400">Precision:</span>
            <span className={`ml-1.5 font-bold font-mono ${isQuantized ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isQuantized ? 'INT8 (CMSIS-NN PTQ)' : 'FP32 Full Precision'}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Personalization:</span>
            <span className={`ml-1.5 font-bold font-mono ${isAdapted ? 'text-indigo-400' : 'text-slate-300'}`}>
              {isAdapted ? 'PEFT Bottleneck Adapter' : 'Global Population Model'}
            </span>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid (6 key metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Flash Storage Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden group hover:border-sky-500/40 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Flash Footprint</span>
            <HardDrive className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-white">{flash_footprint_kb}</span>
            <span className="text-xs font-semibold text-slate-400">KB</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Model + Runtime</span>
            <span className={isQuantized ? "text-emerald-400 font-medium" : "text-slate-400"}>
              {isQuantized ? "3.8x Saved" : "Baseline"}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full ${isQuantized ? 'bg-emerald-500' : 'bg-amber-500'}`} 
              style={{ width: `${Math.min(100, (flash_footprint_kb / 32) * 100)}%` }}
            />
          </div>
        </div>

        {/* SRAM Tensor Arena Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden group hover:border-indigo-500/40 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">SRAM Tensor Arena</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-white">{ram_arena_kb}</span>
            <span className="text-xs font-semibold text-slate-400">KB</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Peak Dynamic RAM</span>
            <span className="text-indigo-400 font-mono">&lt; 8 KB Budget</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className="h-full rounded-full bg-indigo-500" 
              style={{ width: `${Math.min(100, (ram_arena_kb / 8) * 100)}%` }}
            />
          </div>
        </div>

        {/* Inference Latency Card (Cortex-M4) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden group hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Latency (M4 @64MHz)</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-white">{latency_cortex_m4_ms}</span>
            <span className="text-xs font-semibold text-slate-400">ms</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>ESP32: {latency_esp32_ms} ms</span>
            <span className={isQuantized ? "text-emerald-400 font-medium" : "text-amber-400"}>
              {isQuantized ? "CMSIS-NN" : "FP32 FPU"}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full ${isQuantized ? 'bg-emerald-500' : 'bg-amber-500'}`} 
              style={{ width: `${Math.min(100, (latency_cortex_m4_ms / 20) * 100)}%` }}
            />
          </div>
        </div>

        {/* Energy Consumption Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Energy / Inference</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-white">{energy_cortex_m4_mj}</span>
            <span className="text-xs font-semibold text-slate-400">mJ</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>M4 @ 3.3V, 14.5mA</span>
            <span className="text-emerald-400 font-mono">14+ Days Batt</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className="h-full rounded-full bg-emerald-500" 
              style={{ width: `${Math.min(100, (energy_cortex_m4_mj / 1.0) * 100)}%` }}
            />
          </div>
        </div>

        {/* Clinical RMSE Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden group hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Forecast RMSE</span>
            <Activity className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-white">{rmse}</span>
            <span className="text-xs font-semibold text-slate-400">mg/dL</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>MAE: {mae} mg/dL</span>
            <span className={rmse < 15 ? "text-emerald-400 font-medium" : "text-amber-400"}>
              {rmse < 15 ? "Optimal" : "Acceptable"}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className="h-full rounded-full bg-rose-500" 
              style={{ width: `${Math.min(100, Math.max(15, (30 - rmse) / 30 * 100))}%` }}
            />
          </div>
        </div>

        {/* Clinical MARD Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 relative overflow-hidden group hover:border-purple-500/40 transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Clinical MARD</span>
            <Gauge className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-white">{mard_pct}</span>
            <span className="text-xs font-semibold text-slate-400">%</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Clinical Grade</span>
            <span className={mard_pct < 10 ? "text-emerald-400 font-bold" : "text-amber-400 font-medium"}>
              {mard_pct < 10 ? "&lt; 10% Gold" : "Standard"}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className="h-full rounded-full bg-purple-500" 
              style={{ width: `${Math.min(100, Math.max(10, (20 - mard_pct) / 20 * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* PEFT Parameter Efficiency Indicator Card */}
      <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                PEFT / Bottleneck Adapter Parameter Efficiency
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                {isAdapted ? `${100 - trainable_ratio_pct}% Frozen Backbone` : 'Full Backbone Active'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAdapted 
                ? `Only ${trainable_parameters} parameters adapted per patient (~${(trainable_parameters * 4 / 1024).toFixed(2)} KB delta vector), preserving 95%+ flash storage across multi-patient cohorts.`
                : `Global population model utilizes all ${total_parameters} weights without patient-specific adaptation.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-400">Trainable Weights</div>
            <div className="text-sm font-bold font-mono text-white">
              {trainable_parameters} <span className="text-xs text-slate-500 font-normal">/ {total_parameters} ({trainable_ratio_pct}%)</span>
            </div>
          </div>
          <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full bg-indigo-500" 
              style={{ width: `${trainable_ratio_pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
