import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";

export default function BulkUploadPage() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.name.endsWith(".xlsx")) {
      setError("Only .xlsx files are accepted");
      return;
    }
    setError("");
    setFile(f);
    setResult(null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/employees/bulk-upload", form);
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function downloadTemplate() {
    const { data } = await api.get("/employees/bulk-template", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee_import_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  const successRows = result?.rows.filter((r) => r.status === "success") || [];
  const failedRows  = result?.rows.filter((r) => r.status === "error")   || [];

  function downloadFailedRows() {
    const b64 = result?.failed_rows_xlsx_b64;
    if (!b64) return;
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
    const blob   = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href       = url;
    a.download   = "failed_rows.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Bulk Employee Import</h1>
          <p className="text-sm text-gray-500 mt-1">Upload an Excel file to add multiple employees at once</p>
        </div>
        <Link to="/employees" className="text-sm text-indigo-600 hover:underline">← Back to Employees</Link>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { n: "1", title: "Download Template", desc: "Get the Excel template with the required columns" },
          { n: "2", title: "Fill in Data",       desc: "Enter employee details in the sheet (row 2 is a sample)" },
          { n: "3", title: "Upload & Import",    desc: "Upload the filled file — errors are shown per row" },
        ].map((s) => (
          <div key={s.n} className="bg-white rounded-xl shadow p-4 flex gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {s.n}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{s.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Download template */}
      <div className="bg-white rounded-xl shadow p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">Employee Import Template</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Columns: Employee Code, Name, Gender, DOB, Email, Mobile, Department, Designation,
            Employment Type, Status, Joining Date, Branch, Location, Grade
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg text-sm hover:bg-indigo-50"
        >
          ↓ Download Template
        </button>
      </div>

      {/* Upload area */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Upload Filled Template</p>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition"
        >
          {file ? (
            <div>
              <p className="text-sm font-medium text-indigo-700">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm text-gray-500">Click to select an <strong>.xlsx</strong> file</p>
              <p className="text-xs text-gray-400 mt-1">Max 50 MB</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />

        {error && <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40"
          >
            {uploading ? "Importing…" : "Import Employees"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-3xl font-bold text-gray-800">{result.total}</p>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Total Rows</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{result.success}</p>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Imported</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-3xl font-bold text-red-500">{result.failed}</p>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Failed</p>
            </div>
          </div>

          {/* Failed rows */}
          {failedRows.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
              <div className="px-4 py-3 border-b bg-red-50 flex items-center justify-between">
                <span className="text-sm font-medium text-red-700">Failed Rows — fix and re-upload</span>
                {result.failed_rows_xlsx_b64 && (
                  <button
                    onClick={downloadFailedRows}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-400 text-red-600 rounded-lg text-xs hover:bg-red-50"
                  >
                    ↓ Download Failed Rows (.xlsx)
                  </button>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Row #</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {failedRows.map((r) => (
                    <tr key={r.row} className="bg-red-50/40">
                      <td className="px-4 py-2 text-gray-500">{r.row}</td>
                      <td className="px-4 py-2 font-medium text-gray-700">{r.name || "—"}</td>
                      <td className="px-4 py-2 text-red-600">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Successful rows */}
          {successRows.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-4 py-3 border-b bg-green-50 text-sm font-medium text-green-700">
                Successfully Imported
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Row #</th>
                    <th className="px-4 py-2 text-left">Employee Code</th>
                    <th className="px-4 py-2 text-left">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {successRows.map((r) => (
                    <tr key={r.row}>
                      <td className="px-4 py-2 text-gray-400">{r.row}</td>
                      <td className="px-4 py-2 font-mono text-indigo-600">{r.employee_code}</td>
                      <td className="px-4 py-2 text-gray-700">{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
