import api from "./api";

const BASE = "/payroll";

// ── Runs ─────────────────────────────────────────────────────────────────────
export const listRuns   = (params) => api.get(`${BASE}/runs`, { params }).then((r) => r.data);
export const getRun     = (id)     => api.get(`${BASE}/runs/${id}`).then((r) => r.data);
export const createRun  = (body)   => api.post(`${BASE}/runs`, body).then((r) => r.data);
export const computeRun = (id)     => api.post(`${BASE}/runs/${id}/compute`).then((r) => r.data);
export const deleteRun  = (id)     => api.delete(`${BASE}/runs/${id}`);
export const approveAll = (id)     => api.post(`${BASE}/runs/${id}/approve-all`).then((r) => r.data);
export const lockRun    = (id)     => api.post(`${BASE}/runs/${id}/lock`).then((r) => r.data);
export const unlockRun  = (id, reason) => api.post(`${BASE}/runs/${id}/unlock`, { reason }).then((r) => r.data);
export const getRunSummary = (id)  => api.get(`${BASE}/runs/${id}/summary`).then((r) => r.data);

// ── Entries ───────────────────────────────────────────────────────────────────
export const listEntries  = (runId, params) => api.get(`${BASE}/runs/${runId}/entries`, { params }).then((r) => r.data);
export const approveEntry = (id)   => api.post(`${BASE}/entries/${id}/approve`).then((r) => r.data);
export const holdEntry    = (id, reason) => api.post(`${BASE}/entries/${id}/hold`, { reason }).then((r) => r.data);
export const releaseEntry = (id)   => api.post(`${BASE}/entries/${id}/release`).then((r) => r.data);
export const markPaid     = (id, paid_at, remarks) => api.post(`${BASE}/entries/${id}/mark-paid`, { paid_at, remarks }).then((r) => r.data);

// ── Attendance ────────────────────────────────────────────────────────────────
export const loadAttendanceFromReport = (runId) =>
  api.post(`${BASE}/runs/${runId}/load-attendance`).then((r) => r.data);
export const upsertAttendance = (runId, empId, body) =>
  api.patch(`${BASE}/runs/${runId}/attendance/${empId}`, body).then((r) => r.data);

// ── Manual inputs ─────────────────────────────────────────────────────────────
export const upsertManualInputs = (runId, empId, body) =>
  api.patch(`${BASE}/runs/${runId}/manual-inputs/${empId}`, body).then((r) => r.data);

// ── Employees ─────────────────────────────────────────────────────────────────
export const pendingTransitions = () => api.get(`${BASE}/employees/pending-transitions`).then((r) => r.data);
export const checkEligibility   = (empId) => api.get(`${BASE}/employees/${empId}/eligibility`).then((r) => r.data);
