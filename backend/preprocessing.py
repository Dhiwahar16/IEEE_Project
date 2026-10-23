import sqlite3
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any, Union
import numpy as np
import pandas as pd

DB_PATH = Path(__file__).parent / "cgm_data.db"

# Population clinical reference statistics for standardization (fitted on multi-patient CGM cohorts)
# Features: [glucose_level, glucose_velocity, carbs, bolus_dose, basal_rate]
POPULATION_FEATURE_MEANS = np.array([148.5, 0.0, 4.8, 0.45, 1.05], dtype=np.float32)
POPULATION_FEATURE_STDS = np.array([46.2, 4.8, 17.5, 1.60, 0.35], dtype=np.float32)

GLUCOSE_MEAN = float(POPULATION_FEATURE_MEANS[0])
GLUCOSE_STD = float(POPULATION_FEATURE_STDS[0])


class TimeSeriesScaler:
    """
    StandardScaler tailored for multi-feature physiological CGM time-series sequences.
    Ensures numerical stability and exact inverse-transform for glucose target values.
    """
    def __init__(self, means: Optional[np.ndarray] = None, stds: Optional[np.ndarray] = None):
        self.means = means if means is not None else POPULATION_FEATURE_MEANS.copy()
        self.stds = stds if stds is not None else POPULATION_FEATURE_STDS.copy()

    def fit(self, X: np.ndarray):
        # X shape: (N, lookback, n_features) or (N, n_features)
        flat = X.reshape(-1, X.shape[-1])
        self.means = np.mean(flat, axis=0).astype(np.float32)
        self.stds = np.std(flat, axis=0).astype(np.float32)
        self.stds[self.stds < 1e-4] = 1.0

    def transform(self, X: np.ndarray) -> np.ndarray:
        return (X - self.means) / (self.stds + 1e-7)

    def inverse_transform_target(self, y_norm: Union[np.ndarray, float]) -> Union[np.ndarray, float]:
        # Target is glucose_level (index 0)
        return y_norm * self.stds[0] + self.means[0]

    def transform_target(self, y: Union[np.ndarray, float]) -> Union[np.ndarray, float]:
        return (y - self.means[0]) / (self.stds[0] + 1e-7)

    def get_params(self) -> Dict[str, List[float]]:
        return {
            "means": self.means.tolist(),
            "stds": self.stds.tolist()
        }


def load_patient_raw_series(
    patient_id: str,
    days: Optional[int] = None,
    limit: Optional[int] = None
) -> pd.DataFrame:
    """
    Retrieves chronological CGM readings from SQLite table 'cgm_records'.
    """
    conn = sqlite3.connect(str(DB_PATH))
    query = """
    SELECT timestamp, glucose_level, glucose_velocity, basal_rate, bolus_dose, carbs,
           is_interpolated, sensor_dropout, is_hypo, is_hyper
    FROM cgm_records
    WHERE patient_id = ?
    ORDER BY timestamp ASC
    """
    params: List[Any] = [patient_id]

    if days is not None:
        readings_count = int(days * 288)
        query += " LIMIT ?"
        params.append(readings_count)
    elif limit is not None:
        query += " LIMIT ?"
        params.append(int(limit))

    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    return df


def create_sliding_windows(
    patient_id: str,
    lookback_window: int = 12,
    forecast_horizon: int = 6,
    days: Optional[int] = None,
    split_ratio: float = 0.8,
    scaler: Optional[TimeSeriesScaler] = None,
    filter_dropouts: bool = True
) -> Dict[str, Any]:
    """
    Converts raw time-series into supervised machine learning sequences:
      - Lookback: t-11 to t (12 steps = 1 hour of 5-min readings)
      - Horizon: t + forecast_horizon (6 steps = 30-min horizon, 12 steps = 60-min horizon)
      - Features per timestep: [glucose_level, glucose_velocity, carbs, bolus_dose, basal_rate]
      - Target: glucose_level at t + forecast_horizon
      - Filters out sequences spanning large sensor dropout gaps
      - Normalizes inputs using TimeSeriesScaler
      - Splits into train/val/test splits (e.g., first 80% baseline, last 20% for adaptation)
    """
    df = load_patient_raw_series(patient_id, days=days)
    if df.empty or len(df) < (lookback_window + forecast_horizon + 5):
        raise ValueError(f"Insufficient CGM data for patient {patient_id}. Minimum required: {lookback_window + forecast_horizon + 5} steps.")

    feature_cols = ["glucose_level", "glucose_velocity", "carbs", "bolus_dose", "basal_rate"]
    raw_features = df[feature_cols].values.astype(np.float32)
    glucose_vals = df["glucose_level"].values.astype(np.float32)
    timestamps = df["timestamp"].values
    dropout_flags = df["sensor_dropout"].values

    total_len = len(df)
    n_possible = total_len - lookback_window - forecast_horizon + 1

    valid_X = []
    valid_y = []
    valid_target_ts = []
    valid_context_ts = []

    for i in range(n_possible):
        window_start = i
        window_end = i + lookback_window
        target_idx = window_end + forecast_horizon - 1

        # Check for sensor dropouts within context or forecast gap
        if filter_dropouts:
            has_dropout = np.any(dropout_flags[window_start : target_idx + 1] == 1)
            if has_dropout:
                continue

        valid_X.append(raw_features[window_start : window_end])
        valid_y.append(glucose_vals[target_idx])
        valid_target_ts.append(timestamps[target_idx])
        valid_context_ts.append(timestamps[window_end - 1])

    if len(valid_X) == 0:
        raise ValueError(f"No valid sliding windows extracted for {patient_id} after dropout filtering.")

    X = np.array(valid_X, dtype=np.float32) # shape: (N, lookback, 5)
    y = np.array(valid_y, dtype=np.float32) # shape: (N,)

    # Initialize or use provided scaler
    if scaler is None:
        scaler = TimeSeriesScaler()

    # Normalize sequences
    X_norm = scaler.transform(X)
    y_norm = scaler.transform_target(y)

    # Train / Test split chronologically (preserving temporal causality)
    split_idx = int(len(X) * split_ratio)
    split_idx = max(1, min(split_idx, len(X) - 1))

    X_train = X_norm[:split_idx]
    y_train = y_norm[:split_idx]
    y_train_raw = y[:split_idx]
    ts_train = valid_target_ts[:split_idx]

    X_test = X_norm[split_idx:]
    y_test = y_norm[split_idx:]
    y_test_raw = y[split_idx:]
    ts_test = valid_target_ts[split_idx:]

    return {
        "patient_id": patient_id,
        "lookback_window": lookback_window,
        "forecast_horizon": forecast_horizon,
        "total_samples": len(X),
        "feature_names": feature_cols,
        "X_train": X_train,
        "y_train": y_train,
        "y_train_raw": y_train_raw,
        "ts_train": ts_train,
        "X_test": X_test,
        "y_test": y_test,
        "y_test_raw": y_test_raw,
        "ts_test": ts_test,
        "all_target_ts": valid_target_ts,
        "scaler": scaler
    }


if __name__ == "__main__":
    windows = create_sliding_windows("subject_559", lookback_window=12, forecast_horizon=6, days=3)
    print(f"Preprocessed sliding windows for subject_559:")
    print(f"  Total samples: {windows['total_samples']}")
    print(f"  X_train shape: {windows['X_train'].shape}")
    print(f"  X_test shape: {windows['X_test'].shape}")
    print(f"  Sample target raw: {windows['y_test_raw'][:3]} mg/dL")
