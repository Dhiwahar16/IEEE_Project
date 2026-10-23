import React from 'react';
import { User, Activity, Heart, Shield, ArrowRight } from 'lucide-react';

export default function PatientSelector({ patients = [], selectedPatientId, onSelectPatient }) {
  const currentPatient = patients.find(p => p.patient_id === selectedPatientId) || patients[0];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
              Patient CGM Data Stream Explorer
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Select subject from pre-loaded clinical CGM cohorts (OhioT1DM / OpenAPS).
          </p>
        </div>

        {/* Patient Selection Dropdown / Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-medium">Select Subject:</label>
          <select
            value={selectedPatientId}
            onChange={(e) => onSelectPatient(e.target.value)}
            className="bg-slate-950 border border-slate-750 text-white text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {patients.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.name} [{p.dataset}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Patient Profile Card */}
      {currentPatient && (
        <div className="bg-slate-850/80 border border-slate-800 rounded-lg p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white">{currentPatient.name}</span>
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md ${
                  currentPatient.dataset === 'OhioT1DM' 
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                    : 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                }`}>
                  {currentPatient.dataset} Cohort
                </span>
                <span className="text-xs text-slate-400">
                  {currentPatient.gender}, {currentPatient.age} yrs
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 italic">
                "{currentPatient.description}"
              </p>
            </div>

            {/* Quick Clinical Metrics */}
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-sans">Mean Glucose</div>
                <div className="font-bold text-white text-sm">
                  {currentPatient.mean_cgm} <span className="text-[10px] font-normal text-slate-400">mg/dL</span>
                </div>
              </div>
              <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-sans">Time in Range</div>
                <div className={`font-bold text-sm ${currentPatient.time_in_range_pct >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {currentPatient.time_in_range_pct}%
                </div>
              </div>
              <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-sans">Est. HbA1c (GMI)</div>
                <div className="font-bold text-white text-sm">
                  {currentPatient.gmi_hba1c}%
                </div>
              </div>
              <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-sans">Carb Ratio (ICR)</div>
                <div className="font-bold text-sky-400 text-sm">
                  1:{currentPatient.carb_ratio_g_u} <span className="text-[10px] font-normal text-slate-400">g/U</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
