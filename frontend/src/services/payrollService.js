import api from "./api";

export const getPayrollPolicy = () =>
  api.get("/payroll/policy").then((r) => r.data);

export const updatePayrollPolicy = (data) =>
  api.put("/payroll/policy", data).then((r) => r.data);

export const calculateLOP = (cycle_start) =>
  api.post("/payroll/calculate-lop", { cycle_start }).then((r) => r.data);

export const calculateLOPForEmployee = (employee_id, cycle_start) =>
  api.post(`/payroll/calculate-lop/${employee_id}`, { cycle_start }).then((r) => r.data);

export const getLOPReport = (cycle_start) =>
  api.get("/payroll/lop-report", { params: { cycle_start } }).then((r) => r.data);

export const getAttendanceReport = (cycle_start) =>
  api.get("/payroll/attendance-report", { params: { cycle_start } }).then((r) => r.data);

export const overrideDeduction = (data) =>
  api.post("/payroll/deduction/override", data).then((r) => r.data);

export const revertDeductionOverride = (data) =>
  api.delete("/payroll/deduction/override", { data }).then((r) => r.data);
