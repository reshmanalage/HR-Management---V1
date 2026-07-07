import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { importAttendance, mapBiometrics } from "../../services/attendanceService";

export default function AttendanceUploadPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [mapResult, setMapResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();
  const navigate = useNavigate();

  function handleFileChange(e) {
    setFile(e.target.files[0]);
    setResult(null);
    setMapResult(null);
    setError("");
  }

  async function handleMapBiometrics() {
    if (!file) return;
    setMapping(true);
    setError("");
    setMapResult(null);
    try {
      const res = await mapBiometrics(file);
      setMapResult(res);
    } catch (err) {
      setError(err.response?.data?.detail || "Mapping failed. Please try again.");
    } finally {
      setMapping(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const res = await importAttendance(file);
      setResult(res);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-800 mb-1">Import Attendance</h2>
      <p className="text-sm text-gray-500 mb-6">
        Upload the monthly biometric Excel report (Work Duration Report).
      </p>

      {/* File selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 mb-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          {file ? (
            <div>
              <p className="text-sm font-medium text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500">Click to select Excel file</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx or .xls</p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          {/* Step 1: Map biometric IDs */}
          <button
            onClick={handleMapBiometrics}
            disabled={!file || mapping || uploading}
            className="bg-white border border-indigo-500 text-indigo-600 text-sm px-5 py-2 rounded hover:bg-indigo-50 disabled:opacity-50"
          >
            {mapping ? "Mapping…" : "Step 1 — Map Biometric IDs"}
          </button>

          {/* Step 2: Import attendance */}
          <button
            onClick={handleUpload}
            disabled={!file || uploading || mapping}
            className="bg-gray-900 text-white text-sm px-5 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {uploading ? "Importing..." : "Step 2 — Import Attendance"}
          </button>

          {result && (
            <button
              onClick={() => navigate("/attendance")}
              className="text-sm px-5 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              View Attendance
            </button>
          )}
        </div>
      </div>

      {/* Mapping result */}
      {mapResult && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 space-y-3">
          <p className="font-medium text-gray-800 text-sm">Biometric ID Mapping</p>
          <div className="flex gap-6 text-sm">
            <span className="text-green-700">
              <strong>{mapResult.matched}</strong> employees updated
            </span>
            <span className="text-gray-500">
              <strong>{mapResult.skipped}</strong> already set
            </span>
            <span className="text-amber-600">
              <strong>{mapResult.unmatched?.length ?? 0}</strong> unmatched
            </span>
          </div>

          {mapResult.unmatched?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Could not match by name:</p>
              <ul className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                {mapResult.unmatched.map((u) => (
                  <li key={u.biometric_code}>
                    <span className="font-mono text-gray-500 mr-2">#{u.biometric_code}</span>
                    {u.name}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-1">
                Unmatched employees will still appear in attendance records but won't be linked to their profile.
                Make sure their name in the biometric system matches their name in the HR system exactly.
              </p>
            </div>
          )}

          {mapResult.detail?.filter((d) => d.status === "updated").length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                Show updated employees ({mapResult.matched})
              </summary>
              <ul className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
                {mapResult.detail
                  .filter((d) => d.status === "updated")
                  .map((d) => (
                    <li key={d.biometric_code} className="flex gap-2">
                      <span className="font-mono text-indigo-600 w-8">#{d.biometric_code}</span>
                      <span className="text-gray-700">{d.name}</span>
                      <span className="text-gray-400 ml-auto">{d.employee_code}</span>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Import result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
          <p className="font-medium text-green-800">Import complete</p>
          <p className="text-green-700">{result.inserted} records inserted</p>
          {result.skipped > 0 && (
            <p className="text-gray-600">{result.skipped} already existed (skipped)</p>
          )}
          {result.errors?.length > 0 && (
            <ul className="mt-2 text-red-600 space-y-0.5">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
