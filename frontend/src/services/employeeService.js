import api from "./api";

export async function listEmployees() {
  const { data } = await api.get("/employees");
  return data;
}

export async function getEmployee(id) {
  const { data } = await api.get(`/employees/${id}`);
  return data;
}

export async function createEmployee(payload) {
  const { data } = await api.post("/employees", payload);
  return data;
}

export async function updateEmployee(id, payload) {
  const { data } = await api.put(`/employees/${id}`, payload);
  return data;
}

export async function deactivateEmployee(id) {
  await api.delete(`/employees/${id}`);
}

export async function listEmployeesDropdown() {
  const { data } = await api.get("/employees/dropdown");
  return data;
}

export async function uploadEmployeePhoto(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/employees/photo", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { photo_url, file_id }
}

export async function uploadEmployeeDocument(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/employees/document-upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { file_url, file_id, original_filename }
}

export async function addDocument(employeeId, payload) {
  const { data } = await api.post(`/employees/${employeeId}/documents`, payload);
  return data;
}

export async function deleteDocument(employeeId, documentId) {
  await api.delete(`/employees/${employeeId}/documents/${documentId}`);
}

export async function listDepartments() {
  const { data } = await api.get("/departments");
  return data;
}

export async function createDepartment(name) {
  const { data } = await api.post("/departments", { name });
  return data;
}

export async function listDesignations() {
  const { data } = await api.get("/designations");
  return data;
}

export async function createDesignation(title) {
  const { data } = await api.post("/designations", { title });
  return data;
}
