import api from "./api";

export const mapBiometrics = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/attendance/map-biometrics", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  }).then((r) => r.data);
};

export const importAttendance = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/attendance/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  }).then((r) => r.data);
};

export const listCycles = () => api.get("/attendance/cycles").then((r) => r.data);

export const listEmployeesInCycle = (cycleStart) =>
  api.get("/attendance/employees", { params: { cycle_start: cycleStart } }).then((r) => r.data);

export const updateAttendanceRecord = (id, data) =>
  api.patch(`/attendance/${id}`, data).then((r) => r.data);

export const listAttendanceRecords = (cycleStart, employeeCode) =>
  api.get("/attendance", {
    params: { cycle_start: cycleStart, ...(employeeCode ? { employee_code: employeeCode } : {}) },
  }).then((r) => r.data);

export const listNonBiometricEmployees = () =>
  api.get("/attendance/non-biometric-employees").then((r) => r.data);

export const addManualAttendance = (data) =>
  api.post("/attendance/manual", data).then((r) => r.data);

export const addManualBulk = (data) =>
  api.post("/attendance/manual-bulk", data).then((r) => r.data);
