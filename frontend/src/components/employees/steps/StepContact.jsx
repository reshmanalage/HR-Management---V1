const inputCls = "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors";
const labelCls = "block text-[11px] font-semibold tracking-wide uppercase text-gray-500 mb-1.5";

function Field({ label, required, hint, children, className = "" }) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function SectionDivider({ title, action }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400 whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-gray-100" />
      {action}
    </div>
  );
}

function AddressBlock({ addressType, data, onChange }) {
  const addr = data.addresses?.find((a) => a.address_type === addressType) ?? {};

  function setField(field) {
    return (e) => {
      const value = e.target.value || null;
      const existing = data.addresses ?? [];
      const others = existing.filter((a) => a.address_type !== addressType);
      onChange({ ...data, addresses: [...others, { ...addr, address_type: addressType, [field]: value }] });
    };
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Address Line 1" className="sm:col-span-2">
        <input className={inputCls} value={addr.address_line_1 ?? ""} onChange={setField("address_line_1")} placeholder="House / Flat No., Street" autoComplete={addressType === "current" ? "address-line1" : "off"} />
      </Field>
      <Field label="Address Line 2">
        <input className={inputCls} value={addr.address_line_2 ?? ""} onChange={setField("address_line_2")} placeholder="Area / Colony" autoComplete={addressType === "current" ? "address-line2" : "off"} />
      </Field>
      <Field label="Landmark">
        <input className={inputCls} value={addr.landmark ?? ""} onChange={setField("landmark")} placeholder="Near landmark" />
      </Field>
      <Field label="City">
        <input className={inputCls} value={addr.city ?? ""} onChange={setField("city")} placeholder="City" autoComplete={addressType === "current" ? "address-level2" : "off"} />
      </Field>
      <Field label="District">
        <input className={inputCls} value={addr.district ?? ""} onChange={setField("district")} placeholder="District" />
      </Field>
      <Field label="State">
        <input className={inputCls} value={addr.state ?? ""} onChange={setField("state")} placeholder="State" autoComplete={addressType === "current" ? "address-level1" : "off"} />
      </Field>
      <Field label="Country">
        <input className={inputCls} value={addr.country ?? "India"} onChange={setField("country")} placeholder="Country" autoComplete={addressType === "current" ? "country-name" : "off"} />
      </Field>
      <Field label="Postal Code">
        <input className={inputCls} value={addr.postal_code ?? ""} onChange={setField("postal_code")} placeholder="PIN / ZIP" maxLength={10} autoComplete={addressType === "current" ? "postal-code" : "off"} />
      </Field>
    </div>
  );
}

export default function StepContact({ data, onChange }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value || null });

  function copyCurrent() {
    const current = data.addresses?.find((a) => a.address_type === "current");
    if (!current) return;
    const others = (data.addresses ?? []).filter((a) => a.address_type !== "permanent");
    onChange({ ...data, addresses: [...others, { ...current, address_type: "permanent" }] });
  }

  return (
    <div className="space-y-6">
      {/* Contact details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Personal Email" hint="Used for account recovery and emergency contact.">
          <input
            type="email"
            className={inputCls}
            value={data.personal_email ?? ""}
            onChange={set("personal_email")}
            placeholder="personal@gmail.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Company Email" hint="Primary work email for this employee.">
          <input
            type="email"
            className={inputCls}
            value={data.company_email ?? ""}
            onChange={set("company_email")}
            placeholder="name@company.com"
            autoComplete="work email"
          />
        </Field>
        <Field label="Mobile Number" hint="Primary contact number.">
          <input
            type="tel"
            className={inputCls}
            value={data.mobile_number ?? ""}
            onChange={set("mobile_number")}
            placeholder="+91 98765 43210"
            autoComplete="tel"
          />
        </Field>
        <Field label="Alternate Mobile" hint="Secondary / emergency contact.">
          <input
            type="tel"
            className={inputCls}
            value={data.alternate_mobile ?? ""}
            onChange={set("alternate_mobile")}
            placeholder="+91 98765 43210"
            autoComplete="tel"
          />
        </Field>
      </div>

      {/* Current address */}
      <SectionDivider title="Current / Residential Address" />
      <AddressBlock addressType="current" data={data} onChange={onChange} />

      {/* Permanent address */}
      <SectionDivider
        title="Permanent Address"
        action={
          <button
            type="button"
            onClick={copyCurrent}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50 transition-colors whitespace-nowrap shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Same as current
          </button>
        }
      />
      <AddressBlock addressType="permanent" data={data} onChange={onChange} />
    </div>
  );
}
