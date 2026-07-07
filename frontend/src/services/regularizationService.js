import api from "./api";

export const applyRegularization = (data) =>
  api.post("/regularizations", data).then((r) => r.data);

export const getMyRegularizations = () =>
  api.get("/regularizations/me").then((r) => r.data);

export const getAllRegularizations = (status) =>
  api.get("/regularizations", { params: status ? { status } : {} }).then((r) => r.data);

export const decideRegularization = (id, action, comment) =>
  api.post(`/regularizations/${id}/decide`, { action, comment }).then((r) => r.data);

export const cancelRegularization = (id) =>
  api.post(`/regularizations/${id}/cancel`).then((r) => r.data);
