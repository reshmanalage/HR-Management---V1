const inputCls = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function AddressBlock({ title, addressType, data, onChange }) {
  const addr = data.addresses?.find((a) => a.address_type === addressType) ?? {};

  function setField(field) {
    return (e) => {
      const value = e.target.value || null;
      const existing = data.addresses ?? [];
      const others = existing.filter((a) => a.address_type !== addressType);
      onChange({
        ...data,
        addresses: [...others, { ...addr, address_type: addressType, [field]: value }],
      });
    };
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Address Line 1">
          <input className={inputCls} value={addr.address_line_1 ?? ""} onChange={setField("address_line_1")} placeholder="House / Flat No., Street" />
        </Field>
        <Field label="Address Line 2">
          <input className={inputCls} value={addr.address_line_2 ?? ""} onChange={setField("address_line_2")} placeholder="Area / Colony" />
        </Field>
        <Field label="Landmark">
          <input className={inputCls} value={addr.landmark ?? ""} onChange={setField("landmark")} placeholder="Near landmark" />
        </Field>
        <Field label="City">
          <input className={inputCls} value={addr.city ?? ""} onChange={setField("city")} placeholder="City" />
        </Field>
        <Field label="District">
          <input className={inputCls} value={addr.district ?? ""} onChange={setField("district")} placeholder="District" />
        </Field>
        <Field label="State">
          <input className={inputCls} value={addr.state ?? ""} onChange={setField("state")} placeholder="State" />
        </Field>
        <Field label="Country">
          <input className={inputCls} value={addr.country ?? "India"} onChange={setField("country")} placeholder="Country" />
        </Field>
        <Field label="Postal Code">
          <input className={inputCls} value={addr.postal_code ?? ""} onChange={setField("postal_code")} placeholder="PIN / ZIP" />
        </Field>
      </div>
    </div>
  );
}

export default function StepContact({ data, onChange }) {
  const set = (field) => (e) => onChange({ ...data, [field]: e.target.value || null });

  function copyCurrent() {
    const current = data.addresses?.find((a) => a.address_type === "current");
    if (!current) return;
    const others = (data.addresses ?? []).filter((a) => a.address_type !== "permanent");
    onChange({
      ...data,
      addresses: [...others, { ...current, address_type: "permanent" }],
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Personal Email</label>
          <input type="email" className={inputCls} value={data.personal_email ?? ""} onChange={set("personal_email")} placeholder="personal@gmail.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Email</label>
          <input type="email" className={inputCls} value={data.company_email ?? ""} onChange={set("company_email")} placeholder="name@company.com" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
          <input className={inputCls} value={data.mobile_number ?? ""} onChange={set("mobile_number")} placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Alternate Mobile</label>
          <input className={inputCls} value={data.alternate_mobile ?? ""} onChange={set("alternate_mobile")} placeholder="Alternate contact" />
        </div>
      </div>

      <AddressBlock
        title="Current / Residential Address"
        addressType="current"
        data={data}
        onChange={onChange}
      />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Permanent Address</h3>
        <button
          type="button"
          onClick={copyCurrent}
          className="text-xs text-indigo-600 hover:underline"
        >
          Same as current address
        </button>
      </div>

      <AddressBlock
        title=""
        addressType="permanent"
        data={data}
        onChange={onChange}
      />
    </div>
  );
}
