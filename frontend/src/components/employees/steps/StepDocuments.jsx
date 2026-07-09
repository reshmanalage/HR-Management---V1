import { useRef, useState } from "react";
import { uploadEmployeeDocument } from "../../../services/employeeService";

const DOC_TYPES = [
  { value: "AADHAAR",    label: "Aadhaar Card" },
  { value: "PAN",        label: "PAN Card" },
  { value: "PASSPORT",   label: "Passport" },
  { value: "VOTER_ID",   label: "Voter ID" },
  { value: "DL",         label: "Driving Licence" },
  { value: "BIRTH_CERT", label: "Birth Certificate" },
  { value: "10TH",       label: "10th Marksheet" },
  { value: "12TH",       label: "12th Marksheet" },
  { value: "UG_DEGREE",  label: "UG Degree" },
  { value: "PG_DEGREE",  label: "PG Degree" },
  { value: "EXP_LETTER", label: "Experience Letter" },
  { value: "REL_LETTER", label: "Relieving Letter" },
  { value: "OTHER",      label: "Other" },
];

const inputCls = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors";
const labelCls = "block text-[11px] font-semibold tracking-wide uppercase text-gray-500 mb-1.5";

function Field({ label, required, children }) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function DocumentRow({ doc, index, onChange, onRemove }) {
  const fileRef = useRef(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const set = (field) => (e) => onChange(index, { ...doc, [field]: e.target.value || null });

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadEmployeeDocument(file);
      onChange(index, { ...doc, file_url: result.file_url, drive_file_id: result.file_id, original_filename: result.original_filename });
    } catch {
      setUploadError("Upload failed. Check Drive configuration.");
    } finally {
      setUploading(false);
    }
  }

  const docLabel = DOC_TYPES.find((t) => t.value === doc.document_type)?.label ?? "Document";

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Row header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">{doc.document_type ? docLabel : `Document ${index + 1}`}</span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          title="Remove"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Document Type" required>
            <select className={inputCls} value={doc.document_type ?? ""} onChange={set("document_type")}>
              <option value="">Select…</option>
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          {doc.document_type === "OTHER" && (
            <Field label="Custom Label">
              <input className={inputCls} value={doc.document_label ?? ""} onChange={set("document_label")} placeholder="Document name" />
            </Field>
          )}
          <Field label="Document Number">
            <input className={inputCls} value={doc.document_number ?? ""} onChange={set("document_number")} placeholder="ID number" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Issue Date">
            <input type="date" className={inputCls} value={doc.issue_date ?? ""} onChange={set("issue_date")} />
          </Field>
          <Field label="Expiry Date">
            <input type="date" className={inputCls} value={doc.expiry_date ?? ""} onChange={set("expiry_date")} />
          </Field>
          <Field label="Issuing Authority">
            <input className={inputCls} value={doc.issuing_authority ?? ""} onChange={set("issuing_authority")} placeholder="e.g. UIDAI" />
          </Field>
        </div>

        {/* File upload */}
        <div>
          <label className={labelCls}>Upload File</label>
          {doc.file_url ? (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3.5 py-2.5 border border-gray-200">
              <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline truncate flex-1">
                {doc.original_filename || "View uploaded file"}
              </a>
              <button
                type="button"
                onClick={() => onChange(index, { ...doc, file_url: null, drive_file_id: null, original_filename: null })}
                className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0"
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 text-sm border border-dashed border-gray-300 rounded-lg px-4 py-2.5 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50 w-full justify-center"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploading ? "Uploading…" : "Choose file (PDF, JPG, PNG)"}
              </button>
              {uploadError && <p className="text-xs text-red-600 mt-1.5">{uploadError}</p>}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={handleFile} />
        </div>
      </div>
    </div>
  );
}

export default function StepDocuments({ data, onChange }) {
  const docs = data.documents ?? [];

  function addDoc() {
    onChange({ ...data, documents: [...docs, { document_type: "", document_number: "", file_url: null }] });
  }

  function updateDoc(index, updated) {
    onChange({ ...data, documents: docs.map((d, i) => (i === index ? updated : d)) });
  }

  function removeDoc(index) {
    onChange({ ...data, documents: docs.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Upload identity, statutory, and education documents.</p>
        <button
          type="button"
          onClick={addDoc}
          className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3.5 py-2 rounded-lg hover:bg-indigo-100 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Document
        </button>
      </div>

      {docs.length === 0 && (
        <button
          type="button"
          onClick={addDoc}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm hover:border-indigo-300 hover:text-indigo-500 transition-colors"
        >
          <svg className="mx-auto w-8 h-8 mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Click to add a document
        </button>
      )}

      {docs.map((doc, i) => (
        <DocumentRow key={i} doc={doc} index={i} onChange={updateDoc} onRemove={removeDoc} />
      ))}
    </div>
  );
}
