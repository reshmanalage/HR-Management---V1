import { useRef, useState } from "react";
import { uploadEmployeePhoto } from "../../services/employeeService";

export default function PhotoUpload({ value, onChange }) {
  const inputRef  = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState(null);
  const [preview, setPreview]     = useState(value ?? null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > 5 * 1024 * 1024)   { setError("Photo must be smaller than 5 MB."); return; }

    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const result = await uploadEmployeePhoto(file);
      onChange({ photo_url: result.photo_url, photo_drive_file_id: result.file_id });
    } catch {
      setError("Upload failed. Check that Google Drive is configured.");
      setPreview(value ?? null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className="group relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors overflow-hidden bg-gray-50"
        title={preview ? "Change photo" : "Upload photo"}
      >
        {preview ? (
          <>
            <img src={preview} alt="Employee photo" className="w-full h-full object-cover" />
            {/* hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400 px-2">
            <svg className="mx-auto mb-1 w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] leading-tight font-medium">Upload photo</span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {preview && !uploading && (
        <button
          type="button"
          onClick={() => { setPreview(null); onChange({ photo_url: null, photo_drive_file_id: null }); }}
          className="text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
        >
          Remove
        </button>
      )}
      {error && <p className="text-[11px] text-red-600 text-center max-w-[100px]">{error}</p>}
      {!preview && !error && (
        <p className="text-[10px] text-gray-400 text-center leading-snug max-w-[90px]">JPEG, PNG · max 5 MB</p>
      )}
    </div>
  );
}
