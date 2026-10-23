import sqlite3
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple, Optional

DB_PATH = Path(__file__).parent / "cgm_data.db"

# OhioT1DM & OpenAPS clinical subjects profile metadata
PATIENT_METADATA = [
    {
        "patient_id": "subject_559",
        "dataset": "OhioT1DM",
        "name": "Subject 559 (Brittle Glycemic Control)",
        "age": 42,
        "gender": "Female",
        "basal_rate_u_hr": 0.95,
        "carb_ratio_g_u": 8.5,
        "correction_factor_mgdl_u": 35.0,
        "mean_cgm": 168.4,
        "gmi_hba1c": 7.3,
        "time_in_range_pct": 59.2,
        "description": "High glycemic variability with severe postprandial excursions and dawn phenomenon."
    },
    {
        "patient_id": "subject_563",
        "dataset": "OhioT1DM",
        "name": "Subject 563 (Nocturnal Hypo Risk)",
        "age": 36,
        "gender": "Male",
        "basal_rate_u_hr": 1.10,
        "carb_ratio_g_u": 10.0,
        "correction_factor_mgdl_u": 42.0,
        "mean_cgm": 144.1,
        "gmi_hba1c": 6.7,
        "time_in_range_pct": 74.8,
        "description": "Prone to late-night hypoglycemia following physical activity; moderate baseline control."
    },
    {
        "patient_id": "subject_570",
        "dataset": "OpenAPS",
        "name": "Subject 570 (Automated Micro-Bolusing)",
        "age": 29,
        "gender": "Female",
        "basal_rate_u_hr": 0.85,
        "carb_ratio_g_u": 12.0,
        "correction_factor_mgdl_u": 48.0,
        "mean_cgm": 126.8,
        "gmi_hba1c": 6.3,
        "time_in_range_pct": 87.5,
        "description": "Tight algorithmic closed-loop regulation with small dynamic micro-boluses and minimal variance."
    },
    {
        "patient_id": "subject_575",
        "dataset": "OhioT1DM",
        "name": "Subject 575 (Insulin Resistant T1D)",
        "age": 51,
        "gender": "Male",
        "basal_rate_u_hr": 1.45,
        "carb_ratio_g_u": 6.5,
        "correction_factor_mgdl_u": 28.0,
        "mean_cgm": 182.2,
        "gmi_hba1c": 7.8,
        "time_in_range_pct": 52.4,
        "description": "High insulin requirements, prolonged absorption delays, and frequent rebound hyperglycemia."
    },
    {
        "patient_id": "subject_588",
        "dataset": "OpenAPS",
        "name": "Subject 588 (Athletic / Variable Sensitivity)",
        "age": 24,
        "gender": "Male",
        "basal_rate_u_hr": 0.90,
        "carb_ratio_g_u": 14.0,
        "correction_factor_mgdl_u": 55.0,
        "mean_cgm": 133.5,
        "gmi_hba1c": 6.5,
        "time_in_range_pct": 80.1,
        "description": "Competitive athlete with sharp insulin sensitivity surges and rapid drop rates during workouts."
    },
    {
        "patient_id": "subject_591",
        "dataset": "OhioT1DM",
        "name": "Subject 591 (Irregular Meal Schedule)",
        "age": 38,
        "gender": "Female",
        "basal_rate_u_hr": 1.05,
        "carb_ratio_g_u": 9.0,
        "correction_factor_mgdl_u": 38.0,
        "mean_cgm": 155.0,
        "gmi_hba1c": 7.0,
        "time_in_range_pct": 68.3,
        "description": "Variable daily schedule with skipped breakfasts, large late dinners, and delayed boluses."
    }
]


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(force: bool = False):
    """
    Initializes SQLite tables and generates physiologically realistic 14-day CGM time-series
    for the patient cohort if tables are missing or force is True.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

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
        is_hyper INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cgm_patient_time ON cgm_readings (patient_id, timestamp)")

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

    conn.commit()

    # Check if patient data already exists
    cursor.execute("SELECT COUNT(*) FROM patients")
    patient_count = cursor.fetchone()[0]

    if patient_count == 0 or force:
        print("[Database] Generating physiological CGM time-series data...")
        populate_cgm_datasets(conn)

    conn.close()


def generate_synthetic_patient_stream(meta: Dict, num_days: int = 14) -> pd.DataFrame:
    """
    Simulates continuous glucose time-series at 5-minute sampling resolution (288 steps/day)
    incorporating Hovorka / Bergman-inspired pharmacodynamics:
    - Endogenous glucose production and circadian baseline (dawn phenomenon)
    - Two-compartment carbohydrate absorption (gut absorption delay)
    - Two-compartment subcutaneous insulin absorption (active insulin on board - IOB)
    - Realistic sensor measurement noise (autocorrelated noise + Ornstein-Uhlenbeck)
    """
    np.random.seed(hash(meta["patient_id"]) % (2**31 - 1))
    
    total_steps = num_days * 288
    start_time = datetime(2026, 9, 1, 0, 0, 0)
    timestamps = [start_time + timedelta(minutes=5 * i) for i in range(total_steps)]

    # Baseline physiological parameters
    basal_rate = meta["basal_rate_u_hr"]
    carb_ratio = meta["carb_ratio_g_u"] # grams of carbs covered by 1 U insulin
    sens = meta["correction_factor_mgdl_u"] # mg/dL drop per 1 U insulin
    base_target = meta["mean_cgm"]

    glucose_series = np.zeros(total_steps)
    meal_series = np.zeros(total_steps)
    bolus_series = np.zeros(total_steps)

    # State variables for two-compartment insulin and carb dynamics
    carb_gut_1 = 0.0
    carb_gut_2 = 0.0
    ins_sub_1 = 0.0
    ins_sub_2 = 0.0
    
    current_glucose = base_target + np.random.normal(0, 10)

    for step in range(total_steps):
        t = timestamps[step]
        hour = t.hour + t.minute / 60.0

        # Meal generation schedule
        carbs = 0.0
        bolus = 0.0

        # Breakfast around 07:30 - 08:30
        if 7.5 <= hour <= 8.5 and np.random.rand() < 0.25 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([35.0, 45.0, 55.0])
        # Lunch around 12:30 - 13:30
        elif 12.5 <= hour <= 13.5 and np.random.rand() < 0.25 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([50.0, 65.0, 80.0])
        # Afternoon Snack around 16:00
        elif 15.8 <= hour <= 16.5 and np.random.rand() < 0.15 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([15.0, 25.0])
        # Dinner around 19:30 - 20:30
        elif 19.5 <= hour <= 20.5 and np.random.rand() < 0.25 and np.sum(meal_series[max(0, step-12):step]) == 0:
            carbs = np.random.choice([60.0, 75.0, 95.0])

        if carbs > 0:
            meal_series[step] = carbs
            # Patient bolus strategy: ideal bolus + minor timing/dose variance
            ideal_bolus = carbs / carb_ratio
            # Patient specific bolus error
            dose_multiplier = np.random.normal(1.0, 0.08)
            bolus = round(max(0.0, ideal_bolus * dose_multiplier), 1)
            bolus_series[step] = bolus

        # Two-compartment Carb digestion dynamics (time constant ~ 25 min = 5 steps)
        k_carb = 0.20
        carb_gut_1 += carbs - k_carb * carb_gut_1
        carb_gut_2 += k_carb * carb_gut_1 - k_carb * carb_gut_2
        carb_appearance_rate = k_carb * carb_gut_2 # mg/dL/min effect

        # Two-compartment Insulin absorption dynamics (time constant ~ 40 min = 8 steps)
        k_ins = 0.125
        ins_sub_1 += bolus - k_ins * ins_sub_1
        ins_sub_2 += k_ins * ins_sub_1 - k_ins * ins_sub_2
        active_insulin = k_ins * ins_sub_2

        # Circadian rhythm effect (Dawn phenomenon around 04:00 - 08:00)
        circadian = 10.0 * np.sin(2 * np.pi * (hour - 3.0) / 24.0)
        
        # Patient specific glycemic baseline restoration
        drift = 0.015 * (base_target - current_glucose)
        
        # Net glucose velocity (mg/dL per 5-min step)
        d_glucose = (
            (carb_appearance_rate * 3.2)
            - (active_insulin * (sens / 2.0))
            + drift
            + 0.3 * circadian
            + np.random.normal(0, 2.2) # physiological white noise
        )

        current_glucose = np.clip(current_glucose + d_glucose, 45.0, 390.0)
        glucose_series[step] = current_glucose

    df = pd.DataFrame({
        "patient_id": meta["patient_id"],
        "timestamp": [t.isoformat() for t in timestamps],
        "glucose": np.round(glucose_series, 1),
        "meal_carbs": meal_series,
        "bolus_insulin": bolus_series,
        "basal_rate": basal_rate
    })

    # Add derivative (rate of change)
    df["glucose_delta"] = df["glucose"].diff().fillna(0.0).round(2)
    df["is_hypo"] = (df["glucose"] < 70.0).astype(int)
    df["is_hyper"] = (df["glucose"] > 180.0).astype(int)

    return df


def populate_cgm_datasets(conn: sqlite3.Connection):
    cursor = conn.cursor()

    for meta in PATIENT_METADATA:
        print(f"  Generating 14-day CGM stream for {meta['name']}...")
        df = generate_synthetic_patient_stream(meta, num_days=14)

        # Update metadata stats from actual stream
        mean_g = float(df["glucose"].mean())
        tir = float(((df["glucose"] >= 70.0) & (df["glucose"] <= 180.0)).mean() * 100.0)
        gmi = float(3.31 + 0.02392 * mean_g)

        cursor.execute("""
        INSERT OR REPLACE INTO patients (
            patient_id, dataset, name, age, gender, basal_rate_u_hr, carb_ratio_g_u,
            correction_factor_mgdl_u, mean_cgm, gmi_hba1c, time_in_range_pct,
            description, total_readings, date_start, date_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            meta["patient_id"], meta["dataset"], meta["name"], meta["age"], meta["gender"],
            meta["basal_rate_u_hr"], meta["carb_ratio_g_u"], meta["correction_factor_mgdl_u"],
            round(mean_g, 1), round(gmi, 1), round(tir, 1), meta["description"],
            len(df), df["timestamp"].iloc[0], df["timestamp"].iloc[-1]
        ))

        # Store readings in chunks
        df.to_sql("cgm_readings", conn, if_exists="append", index=False)

    conn.commit()
    print("[Database] Successfully populated CGM records for all patients.")


def get_all_patients() -> List[Dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT patient_id, dataset, name, age, gender, basal_rate_u_hr, carb_ratio_g_u,
           correction_factor_mgdl_u, mean_cgm, gmi_hba1c, time_in_range_pct,
           description, total_readings, date_start, date_end
    FROM patients
    ORDER BY patient_id
    """)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_patient_cgm_stream(
    patient_id: str,
    days: Optional[int] = None,
    limit: Optional[int] = None,
    offset: int = 0
) -> pd.DataFrame:
    """
    Retrieves time-ordered CGM readings for a given patient.
    """
    conn = get_db_connection()
    query = "SELECT timestamp, glucose, meal_carbs, bolus_insulin, basal_rate, glucose_delta, is_hypo, is_hyper FROM cgm_readings WHERE patient_id = ? ORDER BY timestamp ASC"
    
    if days is not None:
        readings_count = days * 288
        query += f" LIMIT {readings_count} OFFSET {offset}"
    elif limit is not None:
        query += f" LIMIT {limit} OFFSET {offset}"

    df = pd.read_sql_query(query, conn, params=(patient_id,))
    conn.close()
    return df


def extract_sliding_windows(
    df: pd.DataFrame,
    lookback: int = 12,
    horizon: int = 6
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Builds sliding window tensors for time-series forecasting.
    Input features per step: [glucose, glucose_delta, meal_carbs, bolus_insulin]
    Lookback = 12 (1 hour of 5-min readings: t-11 to t)
    Target = glucose at t+horizon (horizon=6 for 30m, horizon=12 for 60m)
    Returns:
        X: shape (N, lookback, 4)
        y: shape (N,)
        target_timestamps: list of ISO timestamps corresponding to t+horizon
    """
    feature_cols = ["glucose", "glucose_delta", "meal_carbs", "bolus_insulin"]
    features = df[feature_cols].values
    glucose_vals = df["glucose"].values
    timestamps = df["timestamp"].values

    total_len = len(df)
    n_samples = total_len - lookback - horizon + 1

    if n_samples <= 0:
        return np.empty((0, lookback, len(feature_cols))), np.empty((0,)), []

    X = np.zeros((n_samples, lookback, len(feature_cols)), dtype=np.float32)
    y = np.zeros((n_samples,), dtype=np.float32)
    target_ts = []

    for i in range(n_samples):
        X[i] = features[i : i + lookback]
        y[i] = glucose_vals[i + lookback + horizon - 1]
        target_ts.append(timestamps[i + lookback + horizon - 1])

    return X, y, target_ts


if __name__ == "__main__":
    init_db(force=True)
    pts = get_all_patients()
    print(f"Total patients in DB: {len(pts)}")
    sample_df = get_patient_cgm_stream("subject_559", days=1)
    print(f"Sample subject_559 1-day readings: {len(sample_df)}")
