import api from "./api";

export async function listUsers() {
  const { data } = await api.get("/users");
  return data;
}

export async function createUser({ first_name, last_name, email, role_id, employee_code }) {
  const { data } = await api.post("/users", { first_name, last_name, email, role_id, employee_code });
  return data;
}

export async function listRoles() {
  const { data } = await api.get("/roles");
  return data;
}

export async function adminResetPassword(userId, newPassword) {
  const { data } = await api.post(`/users/${userId}/reset-password`, { new_password: newPassword });
  return data;
}
