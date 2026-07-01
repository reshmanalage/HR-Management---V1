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

const inputCls = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function DocumentRow({ doc, index, onChange, onRemove }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const set = (field) => (e) => onChange(index, { ...doc, [field]: e.target.value || null });

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadEmployeeDocument(file);
      onChange(index, {
        ...doc,
        file_url: result.file_url,
        drive_file_id: result.file_id,
        original_filename: result.original_filename,
      });
    } catch {
      setUploadError("Upload failed. Check Drive config.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3 relative">
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute top-3 right-3 text-gray-400 hover:text-red-500 text-lg leading-none"
        title="Remove document"
      >
        ×
      </button>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Document Type *</label>
          <select className={inputCls} value={doc.document_type ?? ""} onChange={set("document_type")}>
            <option value="">— Select —</option>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {doc.document_type === "OTHER" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Custom Label</label>
            <input className={inputCls} value={doc.document_label ?? ""} onChange={set("document_label")} placeholder="Document name" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Document Number</label>
          <input className={inputCls} value={doc.document_number ?? ""} onChange={set("document_number")} placeholder="e.g. AADHAAR 1234 5678 9012" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Issue Date</label>
          <input type="date" className={inputCls} value={doc.issue_date ?? ""} onChange={set("issue_date")} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
          <input type="date" className={inputCls} value={doc.expiry_date ?? ""} onChange={set("expiry_date")} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Issuing Authority</label>
          <input className={inputCls} value={doc.issuing_authority ?? ""} onChange={set("issuing_authority")} placeholder="e.g. UIDAI" />
        </div>
      </div>

      {/* File upload */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Upload File (PDF / Image)</label>
        {doc.file_url ? (
          <div className="flex items-center gap-3">
            <a
              href={doc.file_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-600 hover:underline truncate max-w-xs"
            >
              {doc.original_filename || "View uploaded file"}
            </a>
            <button
              type="button"
              onClick={() => { onChange(index, { ...doc, file_url: null, drive_file_id: null, original_filename: null }); }}
              className="text-xs text-red-500 hover:underline shrink-0"
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
              className="text-xs border border-dashed border-gray-300 rounded px-3 py-2 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Choose file"}
            </button>
            {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
          </div>
        )}
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={handleFile} />
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
    const next = docs.map((d, i) => (i === index ? updated : d));
    onChange({ ...data, documents: next });
  }

  function removeDoc(index) {
    onChange({ ...data, documents: docs.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Upload identity, statutory, and education documents.</p>
        <button
          type="button"
          onClick={addDoc}
          className="text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-md hover:bg-indigo-100"
        >
          + Add Document
        </button>
      </div>

      {docs.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No documents added yet. Click "+ Add Document" to start.
        </div>
      )}

      {docs.map((doc, i) => (
        <DocumentRow key={i} doc={doc} index={i} onChange={updateDoc} onRemove={removeDoc} />
      ))}
    </div>
  );
}
