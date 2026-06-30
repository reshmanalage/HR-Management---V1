import api from "./api";

export async function login({ email, password, remember_me }) {
  const { data } = await api.post("/auth/login", { email, password, remember_me });
  return data;
}

export async function logout(refreshToken) {
  await api.post("/auth/logout", { refresh_token: refreshToken });
}

export async function getCurrentUser() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function forgotPassword(email) {
  await api.post("/auth/forgot-password", { email });
}

export async function resetPassword({ token, new_password }) {
  await api.post("/auth/reset-password", { token, new_password });
}

export async function changePassword({ current_password, new_password }) {
  await api.post("/auth/change-password", { current_password, new_password });
}

export async function listSessions() {
  const { data } = await api.get("/auth/sessions");
  return data;
}

export async function revokeSession(sessionId) {
  await api.delete(`/auth/sessions/${sessionId}`);
}

export async function getLoginHistory() {
  const { data } = await api.get("/auth/login-history");
  return data;
}
