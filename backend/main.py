import os
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from dataset_ingestion import (
    init_cgm_tables,
    ingest_cgm_csv,
    initialize_all_cohorts,
    get_db_connection,
    DB_PATH,
    SAMPLE_DATA_DIR
)
from preprocessing import (
    create_sliding_windows,
    load_patient_raw_series
)
from ml_engine import (
    ml_production_engine,
    HardwareProfiler,
    compute_clarke_error_grid
)

app = FastAPI(
    title="TinyML CGM Adaptation API",
    description="Resource-Efficient Patient-Specific Adaptation for TinyML-Based CGM Glucose Forecasting",
    version="2.0.0"
)

# Enable CORS for React frontend (Vite port 5173 / localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    print("[Server Startup] Checking SQLite tables and cohort datasets...")
    initialize_all_cohorts(force=False)
    print("[Server Startup] Pre-warming global recurrent population models...")
    ml_production_engine.pretrain_global_model("LSTM", epochs=8)
    ml_production_engine.pretrain_global_model("GRU", epochs=8)
    print("[Server Startup] System ready for real-time TinyML inference.")


class PredictRequest(BaseModel):
    patient_id: str = Field(..., example="subject_559")
    architecture: str = Field("LSTM", example="LSTM")
    quantization: str = Field("INT8", example="INT8")
    adaptation: str = Field("ADAPTED", example="ADAPTED")
    window_days: int = Field(7, example=7)
    horizon_mins: int = Field(30, example=30)


class AdaptRequest(BaseModel):
    patient_id: str = Field(..., example="subject_559")
    architecture: str = Field("LSTM", example="LSTM")
    window_days: int = Field(7, example=7)
    horizon_mins: int = Field(30, example=30)
    epochs: int = Field(20, example=20)
    learning_rate: float = Field(0.001, example=0.001)


@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "TinyML CGM Forecasting API",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/patients")
def list_patients():
    """
    Returns list of all available CGM patient profiles from SQLite.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT patient_id, dataset, name, age, gender, basal_rate_u_hr, carb_ratio_g_u,
           correction_factor_mgdl_u, mean_cgm, gmi_hba1c, time_in_range_pct,
           description, total_readings, date_start, date_end
    FROM patients
    ORDER BY patient_id ASC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"patients": rows}


@app.get("/api/patients/{patient_id}")
def get_patient(patient_id: str):
    """
    Returns specific patient clinical metadata.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients WHERE patient_id = ?", (patient_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"patient": dict(row)}
    raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")


@app.get("/api/patients/{patient_id}/stream")
def get_patient_stream(
    patient_id: str,
    days: Optional[int] = Query(3, description="Number of days to retrieve (1-14)"),
    limit: Optional[int] = Query(None, description="Max readings limit")
):
    """
    Retrieves chronological CGM readings from 'cgm_records'.
    """
    df = load_patient_raw_series(patient_id, days=days, limit=limit)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No CGM records found for patient {patient_id}")

    return {
        "patient_id": patient_id,
        "count": len(df),
        "readings": df.to_dict(orient="records")
    }


@app.post("/api/predict")
def predict_cgm(req: PredictRequest):
    """
    Executes live PyTorch / INT8 PTQ inference on real patient sliding windows:
      - Arch: LSTM vs GRU
      - Precision: FP32 vs INT8
      - Personalization: Global Population vs PEFT Bottleneck Adapter
      - Horizon: 30-min (6 steps) vs 60-min (12 steps)
    Returns:
      - Ground truth & predicted glucose curves
      - Shaded confidence bounds (±1.28 * RMSE)
      - Clarke Error Grid scatter points (X = Reference, Y = Predicted) and Zone percentages
      - Embedded hardware metrics (Flash, RAM, Latency, Energy)
    """
    arch = req.architecture.upper()
    if arch not in ["LSTM", "GRU"]:
        raise HTTPException(status_code=400, detail="Invalid architecture. Choose 'LSTM' or 'GRU'.")

    is_quantized = (req.quantization.upper() == "INT8")
    use_adapter = (req.adaptation.upper() == "ADAPTED")
    forecast_horizon = 6 if req.horizon_mins == 30 else 12

    try:
        pred_raw, y_eval_raw, ts_eval, hw_metrics, clarke = ml_production_engine.run_inference(
            patient_id=req.patient_id,
            architecture=arch,
            is_quantized=is_quantized,
            use_adapter=use_adapter,
            adaptation_days=req.window_days,
            forecast_horizon=forecast_horizon
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference execution failed: {str(e)}")

    # Slice evaluation window to recent 288 steps (24 hours) for clear visualization
    eval_slice = min(len(pred_raw), 288)
    pred_slice = pred_raw[-eval_slice:]
    gt_slice = y_eval_raw[-eval_slice:]
    ts_slice = ts_eval[-eval_slice:]

    # Retrieve synchronized meal and bolus events within the slice window
    df_raw = load_patient_raw_series(req.patient_id, days=req.window_days)
    df_slice = df_raw[df_raw["timestamp"].isin(ts_slice)]

    meals = []
    if "carbs" in df_slice.columns:
        meals = df_slice[df_slice["carbs"] > 0][["timestamp", "carbs", "glucose_level"]].rename(
            columns={"carbs": "meal_carbs", "glucose_level": "glucose"}
        ).to_dict(orient="records")

    boluses = []
    if "bolus_dose" in df_slice.columns:
        boluses = df_slice[df_slice["bolus_dose"] > 0][["timestamp", "bolus_dose", "glucose_level"]].rename(
            columns={"bolus_dose": "bolus_insulin", "glucose_level": "glucose"}
        ).to_dict(orient="records")

    return {
        "patient_id": req.patient_id,
        "configuration": {
            "architecture": arch,
            "quantization": "INT8" if is_quantized else "FP32",
            "adaptation": "ADAPTED" if use_adapter else "GLOBAL",
            "window_days": req.window_days,
            "horizon_mins": req.horizon_mins
        },
        "timestamps": ts_slice,
        "ground_truth": np.round(gt_slice, 1).tolist(),
        "predictions": np.round(pred_slice, 1).tolist(),
        "meal_events": meals,
        "bolus_events": boluses,
        "hardware_metrics": hw_metrics,
        "clarke_analysis": {
            "counts": clarke["counts"],
            "percentages": clarke["percentages"],
            "zone_labels": clarke["zone_labels"][-eval_slice:],
            "scatter_points": clarke["scatter_points"][-eval_slice:]
        }
    }


@app.post("/api/adapt")
def adapt_patient_model(req: AdaptRequest):
    """
    Executes lightweight on-device Parameter-Efficient Fine-Tuning (PEFT) on real historical CGM data:
      1. Freezes recurrent backbone weights.
      2. Tunes Bottleneck Adapter + head bias on target patient historical window (1, 3, 7, 14 days).
      3. Exports updated INT8 weights and edge resource profile.
    """
    arch = req.architecture.upper()
    try:
        adaptation_summary = ml_production_engine.train_patient_adapter(
            patient_id=req.patient_id,
            adaptation_days=req.window_days,
            learning_rate=req.learning_rate,
            epochs=req.epochs,
            architecture=arch
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PEFT adaptation failed: {str(e)}")

    # Log adaptation event into SQLite
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS adaptation_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        architecture TEXT NOT NULL,
        window_days INTEGER NOT NULL,
        horizon_mins INTEGER NOT NULL,
        rmse REAL NOT NULL,
        mae REAL NOT NULL,
        mard REAL NOT NULL,
        trainable_params INTEGER NOT NULL,
        total_params INTEGER NOT NULL,
        memory_overhead_kb REAL NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)
    cursor.execute("""
    INSERT INTO adaptation_checkpoints (
        patient_id, architecture, window_days, horizon_mins,
        rmse, mae, mard, trainable_params, total_params,
        memory_overhead_kb, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.patient_id, arch, req.window_days, req.horizon_mins,
        adaptation_summary["metrics"]["rmse"],
        adaptation_summary["metrics"]["mae"],
        adaptation_summary["metrics"]["mard_pct"],
        adaptation_summary["trainable_parameters"],
        adaptation_summary["total_parameters"],
        round(adaptation_summary["trainable_parameters"] * 4 / 1024.0, 3),
        datetime.utcnow().isoformat()
    ))
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "patient_id": req.patient_id,
        "architecture": arch,
        "window_days": req.window_days,
        "training_duration_sec": adaptation_summary["training_duration_sec"],
        "steps_trained": adaptation_summary["steps_trained"],
        "trainable_parameters": adaptation_summary["trainable_parameters"],
        "total_parameters": adaptation_summary["total_parameters"],
        "parameter_savings_pct": round(100.0 - adaptation_summary["trainable_ratio_pct"], 1),
        "adapter_memory_overhead_kb": round(adaptation_summary["trainable_parameters"] * 4 / 1024.0, 3),
        "metrics": adaptation_summary["metrics"],
        "clarke_zones": adaptation_summary["clarke_zones"]
    }


@app.get("/api/benchmarks/{patient_id}")
def get_benchmarks(
    patient_id: str,
    window_days: int = Query(7),
    horizon_mins: int = Query(30)
):
    """
    Computes comparative benchmarks across all 8 configurations:
    (LSTM vs GRU) x (FP32 vs INT8) x (Global vs Adapted)
    Supplies the TradeoffChart with real data metrics.
    """
    forecast_horizon = 6 if horizon_mins == 30 else 12

    benchmarks = []
    configurations = [
        ("LSTM", False, False, "LSTM FP32 Global"),
        ("LSTM", True, False, "LSTM INT8 Global"),
        ("LSTM", False, True, "LSTM FP32 Adapted"),
        ("LSTM", True, True, "LSTM INT8 Adapted"),
        ("GRU", False, False, "GRU FP32 Global"),
        ("GRU", True, False, "GRU INT8 Global"),
        ("GRU", False, True, "GRU FP32 Adapted"),
        ("GRU", True, True, "GRU INT8 Adapted")
    ]

    for arch, is_quant, is_adapt, label in configurations:
        try:
            _, _, _, hw, clarke = ml_production_engine.run_inference(
                patient_id=patient_id,
                architecture=arch,
                is_quantized=is_quant,
                use_adapter=is_adapt,
                adaptation_days=window_days,
                forecast_horizon=forecast_horizon
            )
            benchmarks.append({
                "label": label,
                "architecture": arch,
                "quantization": "INT8" if is_quant else "FP32",
                "adaptation": "Adapted (PEFT)" if is_adapt else "Global",
                "rmse": hw["rmse"],
                "mae": hw["mae"],
                "mard_pct": hw["mard_pct"],
                "flash_kb": hw["flash_footprint_kb"],
                "ram_arena_kb": hw["ram_arena_kb"],
                "latency_m4_ms": hw["latency_cortex_m4_ms"],
                "latency_esp32_ms": hw["latency_esp32_ms"],
                "energy_m4_mj": hw["energy_cortex_m4_mj"],
                "trainable_params": hw["trainable_parameters"],
                "zone_a_pct": clarke["percentages"]["A"]
            })
        except Exception:
            pass

    return {
        "patient_id": patient_id,
        "horizon_mins": horizon_mins,
        "window_days": window_days,
        "benchmarks": benchmarks
    }


@app.post("/api/ingest")
async def upload_cgm_csv(
    file: UploadFile = File(...),
    patient_id: str = Form(...)
):
    """
    Accepts real-world CGM CSV upload (OhioT1DM / OpenAPS format) and ingests into SQLite.
    """
    file_location = SAMPLE_DATA_DIR / f"{patient_id}_uploaded.csv"
    with open(file_location, "wb") as f:
        f.write(await file.read())

    result = ingest_cgm_csv(file_location, patient_id)
    return {
        "status": "success",
        "message": f"Successfully ingested CGM records for {patient_id}",
        "details": result
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
