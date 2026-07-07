import api from "./api";

// Leave Types
export const listLeaveTypes = () => api.get("/leave/types").then((r) => r.data);
export const createLeaveType = (data) => api.post("/leave/types", data).then((r) => r.data);
export const updateLeaveType = (id, data) => api.put(`/leave/types/${id}`, data).then((r) => r.data);
export const deleteLeaveType = (id) => api.delete(`/leave/types/${id}`);

// Holidays
export const listHolidays = (year) => api.get("/leave/holidays", { params: { year } }).then((r) => r.data);
export const createHoliday = (data) => api.post("/leave/holidays", data).then((r) => r.data);
export const updateHoliday = (id, data) => api.put(`/leave/holidays/${id}`, data).then((r) => r.data);
export const deleteHoliday = (id) => api.delete(`/leave/holidays/${id}`);

// Leave Balances
export const initLeaveBalances = (data) => api.post("/leave/balances/init", data).then((r) => r.data);
export const initLeaveBalancesBulk = (year) =>
  api.post("/leave/balances/init-bulk", null, { params: { year } }).then((r) => r.data);
export const getMyBalances = (year) => api.get("/leave/balances/me", { params: { year } }).then((r) => r.data);
export const getEmployeeBalances = (employeeId, year) =>
  api.get(`/leave/balances/${employeeId}`, { params: { year } }).then((r) => r.data);

// Leave Applications
export const applyLeave = (data) => api.post("/leave/applications", data).then((r) => r.data);
export const getMyApplications = () => api.get("/leave/applications/me").then((r) => r.data);
export const getAllApplications = (status) =>
  api.get("/leave/applications", { params: status ? { status } : {} }).then((r) => r.data);
export const getPendingForMe = () => api.get("/leave/applications/pending-for-me").then((r) => r.data);
export const cancelLeave = (id, reason) =>
  api.post(`/leave/applications/${id}/cancel`, { cancel_reason: reason }).then((r) => r.data);
export const decideLeave = (id, action, comment) =>
  api.post(`/leave/applications/${id}/decide`, { action, comment }).then((r) => r.data);

// PL Accrual
export const processPLAccrual = (data) => api.post("/leave/pl-accrual", data).then((r) => r.data);
export const getPLAccrualLog = (employeeId) =>
  api.get(`/leave/pl-accrual/${employeeId}`).then((r) => r.data);
