import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { importAttendance } from "../../services/attendanceService";

export default function AttendanceUploadPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();
  const navigate = useNavigate();

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
    <div className="max-w-xl">
      <h2 className="text-xl font-semibold text-gray-800 mb-1">Import Attendance</h2>
      <p className="text-sm text-gray-500 mb-6">
        Upload the monthly biometric Excel report (Work Duration Report). Both sheets are processed automatically.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { setFile(e.target.files[0]); setResult(null); setError(""); }}
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

        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="bg-gray-900 text-white text-sm px-5 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {uploading ? "Importing..." : "Import"}
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

        {result && (
          <div className="bg-green-50 border border-green-200 rounded p-4 text-sm space-y-1">
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
    </div>
  );
}
