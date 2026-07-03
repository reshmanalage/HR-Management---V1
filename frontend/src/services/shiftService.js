import api from "./api";

export const listShifts = () => api.get("/shifts").then((r) => r.data);
export const createShift = (data) => api.post("/shifts", data).then((r) => r.data);
export const updateShift = (id, data) => api.patch(`/shifts/${id}`, data).then((r) => r.data);
export const deleteShift = (id) => api.delete(`/shifts/${id}`);
