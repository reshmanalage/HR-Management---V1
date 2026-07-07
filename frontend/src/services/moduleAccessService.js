import api from "./api";

export const getUserModules = (userId) =>
  api.get(`/users/${userId}/modules`).then((r) => r.data);

export const setUserModules = (userId, modules) =>
  api.put(`/users/${userId}/modules`, { modules }).then((r) => r.data);
