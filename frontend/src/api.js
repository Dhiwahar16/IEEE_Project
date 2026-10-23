import axios from 'axios';

// Configure Axios client with base URL pointing to FastAPI server
const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchPatients = async () => {
  const response = await api.get('/patients');
  return response.data.patients || [];
};

export const runPrediction = async ({
  patientId,
  architecture = 'LSTM',
  isQuantized = true,
  useAdapter = true,
  horizon = 30,
  windowDays = 7,
}) => {
  const payload = {
    patient_id: patientId,
    architecture: architecture.toUpperCase(),
    quantization: isQuantized ? 'INT8' : 'FP32',
    adaptation: useAdapter ? 'ADAPTED' : 'GLOBAL',
    window_days: Number(windowDays),
    horizon_mins: Number(horizon),
  };
  const response = await api.post('/predict', payload);
  return response.data;
};

export const triggerAdaptation = async ({
  patientId,
  architecture = 'LSTM',
  horizon = 30,
  windowDays = 7,
  epochs = 20,
}) => {
  const payload = {
    patient_id: patientId,
    architecture: architecture.toUpperCase(),
    window_days: Number(windowDays),
    horizon_mins: Number(horizon),
    epochs: Number(epochs),
  };
  const response = await api.post('/adapt', payload);
  return response.data;
};

export const fetchBenchmarks = async (patientId, windowDays = 7, horizon = 30) => {
  const response = await api.get(`/benchmarks/${patientId}`, {
    params: {
      window_days: windowDays,
      horizon_mins: horizon,
    },
  });
  return response.data;
};

export default api;
