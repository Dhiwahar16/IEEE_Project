import os
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Union, Any
import numpy as np
import pandas as pd

DB_PATH = Path(__file__).parent / "cgm_data.db"
SAMPLE_DATA_DIR = Path(__file__).parent / "sample_data"

# Standard OhioT1DM & OpenAPS clinical subjects profile metadata
PATIENT_METADATA_REGISTRY = {
    "subject_559": {
        "dataset": "OhioT1DM",
        "name": "Subject 559 (Brittle Glycemic Control)",
        "age": 42,
        "gender": "Female",
        "basal_rate_u_hr": 0.95,
        "carb_ratio_g_u": 8.5,
        "correction_factor_mgdl_u": 35.0,
        "base_glucose": 168.0,
        "description": "High glycemic variability with severe postprandial excursions and dawn phenomenon."
    },
    "subject_563": {
        "dataset": "OhioT1DM",
        "name": "Subject 563 (Nocturnal Hypo Risk)",
        "age": 36,
        "gender": "Male",
        "basal_rate_u_hr": 1.10,
        "carb_ratio_g_u": 10.0,
        "correction_factor_mgdl_u": 42.0,
        "base_glucose": 144.0,
        "description": "Prone to late-night hypoglycemia following physical activity; moderate baseline control."
    },
    "subject_570": {
        "dataset": "OpenAPS",
        "name": "Subject 570 (Automated Micro-Bolusing)",
        "age": 29,
        "gender": "Female",
        "basal_rate_u_hr": 0.85,
        "carb_ratio_g_u": 12.0,
        "correction_factor_mgdl_u": 48.0,
        "base_glucose": 126.0,
        "description": "Tight algorithmic closed-loop regulation with small dynamic micro-boluses and minimal variance."
    },
    "subject_575": {
        "dataset": "OhioT1DM",
        "name": "Subject 575 (Insulin Resistant T1D)",
        "age": 51,
        "gender": "Male",
        "basal_rate_u_hr": 1.45,
        "carb_ratio_g_u": 6.5,
        "correction_factor_mgdl_u": 28.0,
        "base_glucose": 182.0,
        "description": "High insulin requirements, prolonged absorption delays, and frequent rebound hyperglycemia."
    },
    "subject_588": {
        "dataset": "OpenAPS",
        "name": "Subject 588 (Athletic / Variable Sensitivity)",
        "age": 24,
        "gender": "Male",
        "basal_rate_u_hr": 0.90,
        "carb_ratio_g_u": 14.0,
        "correction_factor_mgdl_u": 55.0,
        "base_glucose": 133.0,
        "description": "Competitive athlete with sharp insulin sensitivity surges and rapid drop rates during workouts."
    },
    "subject_591": {
        "dataset": "OhioT1DM",
        "name": "Subject 591 (Irregular Meal Schedule)",
        "age": 38,
        "gender": "Female",
        "basal_rate_u_hr": 1.05,
        "carb_ratio_g_u": 9.0,
        "correction_factor_mgdl_u": 38.0,
        "base_glucose": 155.0,
        "description": "Variable daily schedule with skipped breakfasts, large late dinners, and delayed boluses."
    }
}


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_cgm_tables(conn: Optional[sqlite3.Connection] = None):
    """
    Initializes SQLite tables for structured CGM records and patient profiles.
    """
    own_conn = False
    if conn is None:
        conn = get_db_connection()
        own_conn = True

    cursor = conn.cursor()

    # Patients metadata table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        patient_id TEXT PRIMARY KEY,
        dataset TEXT NOT NULL,
        name TEXT NOT NULL,
        age INTEGER,
        gender TEXT,
        basal_rate_u_hr REAL,
        carb_ratio_g_u REAL,
        correction_factor_mgdl_u REAL,
        mean_cgm REAL,
        gmi_hba1c REAL,
        time_in_range_pct REAL,
        description TEXT,
        total_readings INTEGER,
        date_start TEXT,
        date_end TEXT
    )
    """)

    # Main structured CGM records table (with interpolation & sensor dropout flags)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cgm_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        glucose_level REAL NOT NULL,
        glucose_velocity REAL NOT NULL DEFAULT 0.0,
        basal_rate REAL NOT NULL DEFAULT 0.0,
        bolus_dose REAL NOT NULL DEFAULT 0.0,
        carbs REAL NOT NULL DEFAULT 0.0,
        is_interpolated INTEGER NOT NULL DEFAULT 0,
        sensor_dropout INTEGER NOT NULL DEFAULT 0,
        is_hypo INTEGER NOT NULL DEFAULT 0,
        is_hyper INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cgm_rec_patient_time ON cgm_records (patient_id, timestamp)")
    conn.commit()

    if own_conn:
        conn.close()


def ingest_cgm_csv(
    file_path: Union[str, Path],
    patient_id: str,
    conn: Optional[sqlite3.Connection] = None
) -> Dict[str, Any]:
    """
    Parses standard CGM CSV records containing:
      - timestamp
      - glucose_level (mg/dL)
      - basal_rate (U/hr)
      - bolus_dose (U)
      - carbs (g)
    Applies Pandas linear/spline interpolation for missing glucose values (< 15-minute gaps)
    and flags larger sensor dropout gaps (>= 15-minute gaps).
    Stores structured records into SQLite table 'cgm_records'.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"CGM CSV file not found: {path}")

    df_raw = pd.read_csv(path)

    # Standardize column names
    col_mapping = {}
    for col in df_raw.columns:
        c_lower = col.strip().lower()
        if c_lower in ["timestamp", "time", "date_time", "datetime"]:
            col_mapping[col] = "timestamp"
        elif c_lower in ["glucose_level", "glucose", "cgm", "blood_glucose", "sgv", "glucose_mgdl"]:
            col_mapping[col] = "glucose_level"
        elif c_lower in ["basal_rate", "basal", "basal_u_hr", "rate"]:
            col_mapping[col] = "basal_rate"
        elif c_lower in ["bolus_dose", "bolus", "insulin", "bolus_insulin", "dose"]:
            col_mapping[col] = "bolus_dose"
        elif c_lower in ["carbs", "carb", "meal_carbs", "carbohydrates", "carb_input"]:
            col_mapping[col] = "carbs"

    df = df_raw.rename(columns=col_mapping)

    if "timestamp" not in df.columns or "glucose_level" not in df.columns:
        raise ValueError(f"CSV must contain at least 'timestamp' and 'glucose_level' columns. Found: {list(df_raw.columns)}")

    # Fill optional columns with default values if not present
    if "basal_rate" not in df.columns:
        meta = PATIENT_METADATA_REGISTRY.get(patient_id, {})
        df["basal_rate"] = meta.get("basal_rate_u_hr", 1.0)
    if "bolus_dose" not in df.columns:
        df["bolus_dose"] = 0.0
    if "carbs" not in df.columns:
        df["carbs"] = 0.0

    # Ensure numeric types
    df["glucose_level"] = pd.to_numeric(df["glucose_level"], errors="coerce")
    df["basal_rate"] = pd.to_numeric(df["basal_rate"], errors="coerce").fillna(0.0)
    df["bolus_dose"] = pd.to_numeric(df["bolus_dose"], errors="coerce").fillna(0.0)
    df["carbs"] = pd.to_numeric(df["carbs"], errors="coerce").fillna(0.0)

    # Parse timestamps and sort
    df["datetime"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("datetime").drop_duplicates(subset=["datetime"]).reset_index(drop=True)

    # Resample to 5-minute regular grid
    df.set_index("datetime", inplace=True)
    resampled = df.resample("5min").asfreq()

    # Identify missing values
    is_missing = resampled["glucose_level"].isna()

    # Calculate gap lengths using continuous missing runs
    gap_lengths = is_missing.groupby((~is_missing).cumsum()).cumsum()

    # Gaps < 15 min: at 5-min intervals, 1 or 2 consecutive missing points (<= 2 steps = 10 min)
    # can be accurately interpolated linearly or using cubic spline
    can_interpolate = is_missing & (gap_lengths <= 2)
    sensor_dropout = is_missing & (gap_lengths > 2)

    # Perform interpolation
    resampled["is_interpolated"] = 0
    resampled.loc[can_interpolate, "is_interpolated"] = 1

    # Linear interpolation for short gaps
    resampled["glucose_level_interp"] = resampled["glucose_level"].interpolate(method="time", limit=2)
    # Fill any remaining dropouts with forward fill + backward fill for integrity
    resampled["glucose_level_final"] = resampled["glucose_level_interp"].bfill().ffill()

    resampled["sensor_dropout"] = 0
    resampled.loc[sensor_dropout, "sensor_dropout"] = 1

    # Non-glucose columns imputation
    resampled["basal_rate"] = resampled["basal_rate"].ffill().bfill()
    resampled["bolus_dose"] = resampled["bolus_dose"].fillna(0.0)
    resampled["carbs"] = resampled["carbs"].fillna(0.0)

    # Calculate glucose velocity (mg/dL per 5-min step)
    resampled["glucose_velocity"] = resampled["glucose_level_final"].diff().fillna(0.0).round(2)
    resampled["is_hypo"] = (resampled["glucose_level_final"] < 70.0).astype(int)
    resampled["is_hyper"] = (resampled["glucose_level_final"] > 180.0).astype(int)

    # Prepare DataFrame for SQLite insertion
    df_clean = pd.DataFrame({
        "patient_id": patient_id,
        "timestamp": resampled.index.strftime("%Y-%m-%dT%H:%M:%S"),
        "glucose_level": resampled["glucose_level_final"].round(1),
        "glucose_velocity": resampled["glucose_velocity"],
        "basal_rate": resampled["basal_rate"].round(2),
        "bolus_dose": resampled["bolus_dose"].round(1),
        "carbs": resampled["carbs"].round(1),
        "is_interpolated": resampled["is_interpolated"],
        "sensor_dropout": resampled["sensor_dropout"],
        "is_hypo": resampled["is_hypo"],
        "is_hyper": resampled["is_hyper"]
    })

    # Store into SQLite
    own_conn = False
    if conn is None:
        conn = get_db_connection()
        own_conn = True

    init_cgm_tables(conn)

    # Remove previous records for this patient to ensure idempotency
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cgm_records WHERE patient_id = ?", (patient_id,))

    # Insert cleaned records
    df_clean.to_sql("cgm_records", conn, if_exists="append", index=False)

    # Also keep cgm_readings populated for backward compatibility with existing views
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cgm_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        glucose REAL NOT NULL,
        meal_carbs REAL NOT NULL DEFAULT 0.0,
        bolus_insulin REAL NOT NULL DEFAULT 0.0,
        basal_rate REAL NOT NULL,
        glucose_delta REAL NOT NULL DEFAULT 0.0,
        is_hypo INTEGER NOT NULL DEFAULT 0,
        is_hyper INTEGER NOT NULL DEFAULT 0
    )
    """)
    cursor.execute("DELETE FROM cgm_readings WHERE patient_id = ?", (patient_id,))
    df_readings = pd.DataFrame({
        "patient_id": df_clean["patient_id"],
        "timestamp": df_clean["timestamp"],
        "glucose": df_clean["glucose_level"],
        "meal_carbs": df_clean["carbs"],
        "bolus_insulin": df_clean["bolus_dose"],
        "basal_rate": df_clean["basal_rate"],
        "glucose_delta": df_clean["glucose_velocity"],
        "is_hypo": df_clean["is_hypo"],
        "is_hyper": df_clean["is_hyper"]
    })
    df_readings.to_sql("cgm_readings", conn, if_exists="append", index=False)

    # Update patient metadata
    mean_g = float(df_clean["glucose_level"].mean())
    tir = float(((df_clean["glucose_level"] >= 70.0) & (df_clean["glucose_level"] <= 180.0)).mean() * 100.0)
    gmi = float(3.31 + 0.02392 * mean_g)

    meta = PATIENT_METADATA_REGISTRY.get(patient_id, {
        "dataset": "OhioT1DM",
        "name": f"Subject {patient_id}",
        "age": 35,
        "gender": "Unknown",
        "basal_rate_u_hr": 1.0,
        "carb_ratio_g_u": 10.0,
        "correction_factor_mgdl_u": 40.0,
        "description": "Clinical T1D participant."
    })

    cursor.execute("""
    INSERT OR REPLACE INTO patients (
        patient_id, dataset, name, age, gender, basal_rate_u_hr, carb_ratio_g_u,
        correction_factor_mgdl_u, mean_cgm, gmi_hba1c, time_in_range_pct,
        description, total_readings, date_start, date_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        patient_id, meta["dataset"], meta["name"], meta["age"], meta["gender"],
        meta["basal_rate_u_hr"], meta["carb_ratio_g_u"], meta["correction_factor_mgdl_u"],
        round(mean_g, 1), round(gmi, 1), round(tir, 1), meta["description"],
        len(df_clean), df_clean["timestamp"].iloc[0], df_clean["timestamp"].iloc[-1]
    ))

    conn.commit()
    if own_conn:
        conn.close()

    return {
        "patient_id": patient_id,
        "total_records": len(df_clean),
        "interpolated_records": int(df_clean["is_interpolated"].sum()),
        "dropout_records": int(df_clean["sensor_dropout"].sum()),
        "mean_cgm": round(mean_g, 1),
        "time_in_range_pct": round(tir, 1),
        "gmi_hba1c": round(gmi, 1),
        "date_start": df_clean["timestamp"].iloc[0],
        "date_end": df_clean["timestamp"].iloc[-1]
    }


def generate_synthetic_cgm_patient(
    patient_id: str,
    days: int = 14,
    output_csv_path: Optional[Union[str, Path]] = None,
    inject_dropouts: bool = True
) -> pd.DataFrame:
    """
    Generates realistic synthetic multi-day CGM time-series data at 5-minute sampling interval (288 steps/day)
    with circadian rhythms, two-compartment meal carbohydrate appearance, insulin on board (IOB) kinetics,
    sensor noise, and occasional dropout gaps.
    Saves CSV and automatically ingests into SQLite 'cgm_records'.
    """
    meta = PATIENT_METADATA_REGISTRY.get(patient_id, {
        "dataset": "OhioT1DM",
        "name": f"Subject {patient_id}",
        "age": 35,
        "gender": "Unknown",
        "basal_rate_u_hr": 1.0,
        "carb_ratio_g_u": 10.0,
        "correction_factor_mgdl_u": 40.0,
        "base_glucose": 150.0,
        "description": "Continuous glucose monitoring subject."
    })

    np.random.seed(abs(hash(patient_id)) % (2**31 - 1))
    total_steps = days * 288
    start_time = datetime(2026, 9, 1, 0, 0, 0)
    timestamps = [start_time + timedelta(minutes=5 * i) for i in range(total_steps)]

    basal_rate = meta["basal_rate_u_hr"]
    carb_ratio = meta["carb_ratio_g_u"]
    sens = meta["correction_factor_mgdl_u"]
    base_target = meta["base_glucose"]

    glucose_series = np.zeros(total_steps)
    meal_series = np.zeros(total_steps)
    bolus_series = np.zeros(total_steps)

    carb_gut_1 = 0.0
    carb_gut_2 = 0.0
    ins_sub_1 = 0.0
    ins_sub_2 = 0.0

    current_glucose = base_target + np.random.normal(0, 8)

    for step in range(total_steps):
        t = timestamps[step]
        hour = t.hour + t.minute / 60.0

        carbs = 0.0
        bolus = 0.0

        # Breakfast around 07:30 - 08:30
        if 7.5 <= hour <= 8.5 and np.random.rand() < 0.28 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([35.0, 45.0, 55.0])
        # Lunch around 12:30 - 13:30
        elif 12.5 <= hour <= 13.5 and np.random.rand() < 0.28 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([50.0, 65.0, 80.0])
        # Afternoon Snack around 16:00
        elif 15.8 <= hour <= 16.5 and np.random.rand() < 0.15 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([15.0, 25.0])
        # Dinner around 19:30 - 20:30
        elif 19.5 <= hour <= 20.5 and np.random.rand() < 0.28 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([60.0, 75.0, 95.0])

        if carbs > 0:
            meal_series[step] = carbs
            ideal_bolus = carbs / carb_ratio
            dose_multiplier = np.random.normal(1.0, 0.06)
            bolus = round(max(0.0, ideal_bolus * dose_multiplier), 1)
            bolus_series[step] = bolus

        # Two-compartment Carb Digestion Kinetics (time constant ~ 25 min)
        k_carb = 0.20
        carb_gut_1 += carbs - k_carb * carb_gut_1
        carb_gut_2 += k_carb * carb_gut_1 - k_carb * carb_gut_2
        carb_appearance = k_carb * carb_gut_2

        # Two-compartment Subcutaneous Insulin Absorption (time constant ~ 40 min)
        k_ins = 0.125
        ins_sub_1 += bolus - k_ins * ins_sub_1
        ins_sub_2 += k_ins * ins_sub_1 - k_ins * ins_sub_2
        active_insulin = k_ins * ins_sub_2

        # Circadian variation (dawn phenomenon around 04:00 - 08:00)
        circadian = 11.0 * np.sin(2 * np.pi * (hour - 3.5) / 24.0)
        drift = 0.016 * (base_target - current_glucose)

        # Net glucose velocity (mg/dL per 5-min step)
        d_glucose = (
            (carb_appearance * 3.3)
            - (active_insulin * (sens / 2.0))
            + drift
            + 0.3 * circadian
            + np.random.normal(0, 2.0)
        )

        current_glucose = np.clip(current_glucose + d_glucose, 45.0, 395.0)
        glucose_series[step] = current_glucose

    df = pd.DataFrame({
        "timestamp": [t.strftime("%Y-%m-%d %H:%M:%S") for t in timestamps],
        "glucose_level": np.round(glucose_series, 1),
        "basal_rate": basal_rate,
        "bolus_dose": bolus_series,
        "carbs": meal_series
    })

    # Inject minor sensor dropouts (e.g. 1-2 points dropout every ~2-3 days, and one 4-point dropout)
    if inject_dropouts and total_steps > 300:
        # 1-point dropouts (interpolatable)
        for d_idx in [120, 450, 920, 1500, 2400]:
            if d_idx < total_steps:
                df.loc[d_idx, "glucose_level"] = np.nan
        # 2-point dropout (interpolatable)
        if total_steps > 650:
            df.loc[640:641, "glucose_level"] = np.nan
        # 4-point dropout (sensor dropout > 15 min gap)
        if total_steps > 1250:
            df.loc[1240:1243, "glucose_level"] = np.nan

    # Save to CSV if requested
    if output_csv_path is None:
        SAMPLE_DATA_DIR.mkdir(parents=True, exist_ok=True)
        output_csv_path = SAMPLE_DATA_DIR / f"{patient_id}.csv"
    else:
        output_csv_path = Path(output_csv_path)
        output_csv_path.parent.mkdir(parents=True, exist_ok=True)

    df.to_csv(output_csv_path, index=False)

    # Ingest CSV into SQLite cgm_records
    ingest_cgm_csv(output_csv_path, patient_id)

    return df


def initialize_all_cohorts(force: bool = False):
    """
    Bulk ingests all default OhioT1DM & OpenAPS clinical subjects.
    """
    SAMPLE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db_connection()
    init_cgm_tables(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM patients")
    count = cursor.fetchone()[0]
    conn.close()

    if count < len(PATIENT_METADATA_REGISTRY) or force:
        print("[Dataset Ingestion] Populating 14-day CGM datasets for all subjects...")
        for pid in PATIENT_METADATA_REGISTRY.keys():
            csv_path = SAMPLE_DATA_DIR / f"{pid}.csv"
            if not csv_path.exists() or force:
                print(f"  Generating and ingesting {pid} -> {csv_path.name}")
                generate_synthetic_cgm_patient(pid, days=14, output_csv_path=csv_path)
            else:
                print(f"  Ingesting existing {pid} from CSV: {csv_path.name}")
                ingest_cgm_csv(csv_path, pid)
        print("[Dataset Ingestion] Cohort ingestion complete.")


if __name__ == "__main__":
    initialize_all_cohorts(force=True)
