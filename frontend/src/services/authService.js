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
