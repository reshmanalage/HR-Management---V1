import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  createEmployee,
  updateEmployee,
  getEmployee,
  listDepartments,
  listDesignations,
  createDepartment,
  createDesignation,
} from "../../services/employeeService";
import PhotoUpload from "../../components/employees/PhotoUpload";

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function EmployeeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [photo, setPhoto] = useState({ photo_url: null, photo_drive_file_id: null });
  const [serverError, setServerError] = useState(null);
  const [loading, setLoading] = useState(isEdit);

  // Inline-add state
  const [newDept, setNewDept] = useState("");
  const [newDesig, setNewDesig] = useState("");
  const [addingDept, setAddingDept] = useState(false);
  const [addingDesig, setAddingDesig] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    async function init() {
      const [depts, desigs] = await Promise.all([listDepartments(), listDesignations()]);
      setDepartments(depts);
      setDesignations(desigs);

      if (isEdit) {
        const emp = await getEmployee(Number(id));
        reset({
          first_name: emp.first_name,
          last_name: emp.last_name,
          email: emp.email ?? "",
          phone: emp.phone ?? "",
          gender: emp.gender ?? "",
          date_of_birth: emp.date_of_birth ?? "",
          date_of_joining: emp.date_of_joining ?? "",
          department_id: emp.department?.id ?? "",
          designation_id: emp.designation?.id ?? "",
          address: emp.address ?? "",
        });
        setPhoto({ photo_url: emp.photo_url, photo_drive_file_id: null });
        setLoading(false);
      }
    }
    init();
  }, [id, isEdit, reset]);

  async function handleAddDept() {
    if (!newDept.trim()) return;
    setAddingDept(true);
    try {
      const dept = await createDepartment(newDept.trim());
      setDepartments((prev) => [...prev, dept]);
      setValue("department_id", dept.id);
      setNewDept("");
    } finally {
      setAddingDept(false);
    }
  }

  async function handleAddDesig() {
    if (!newDesig.trim()) return;
    setAddingDesig(true);
    try {
      const desig = await createDesignation(newDesig.trim());
      setDesignations((prev) => [...prev, desig]);
      setValue("designation_id", desig.id);
      setNewDesig("");
    } finally {
      setAddingDesig(false);
    }
  }

  async function onSubmit(values) {
    setServerError(null);
    const payload = {
      ...values,
      department_id: values.department_id ? Number(values.department_id) : null,
      designation_id: values.designation_id ? Number(values.designation_id) : null,
      gender: values.gender || null,
      date_of_birth: values.date_of_birth || null,
      date_of_joining: values.date_of_joining || null,
      email: values.email || null,
      phone: values.phone || null,
      address: values.address || null,
      photo_url: photo.photo_url,
      photo_drive_file_id: photo.photo_drive_file_id,
    };

    try {
      if (isEdit) {
        await updateEmployee(Number(id), payload);
      } else {
        await createEmployee(payload);
      }
      navigate("/employees");
    } catch (err) {
      setServerError(err.response?.data?.detail ?? "Something went wrong.");
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        {isEdit ? "Edit Employee" : "Add Employee"}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-6 space-y-6">

        {/* Photo */}
        <div className="flex justify-center">
          <PhotoUpload value={photo.photo_url} onChange={setPhoto} />
        </div>

        {serverError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-md px-4 py-3 text-sm">
            {serverError}
          </div>
        )}

        {/* Name */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name *" error={errors.first_name?.message}>
            <input
              {...register("first_name", { required: "Required" })}
              className={inputCls}
              placeholder="First name"
            />
          </Field>
          <Field label="Last Name *" error={errors.last_name?.message}>
            <input
              {...register("last_name", { required: "Required" })}
              className={inputCls}
              placeholder="Last name"
            />
          </Field>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" error={errors.email?.message}>
            <input
              {...register("email")}
              type="email"
              className={inputCls}
              placeholder="employee@example.com"
            />
          </Field>
          <Field label="Phone">
            <input
              {...register("phone")}
              className={inputCls}
              placeholder="+91 98765 43210"
            />
          </Field>
        </div>

        {/* Personal */}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Gender">
            <select {...register("gender")} className={inputCls}>
              <option value="">— Select —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date of Birth">
            <input {...register("date_of_birth")} type="date" className={inputCls} />
          </Field>
          <Field label="Date of Joining">
            <input {...register("date_of_joining")} type="date" className={inputCls} />
          </Field>
        </div>

        {/* Department */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Department">
            <select {...register("department_id")} className={inputCls}>
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                placeholder="New department…"
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddDept())}
              />
              <button
                type="button"
                onClick={handleAddDept}
                disabled={addingDept || !newDept.trim()}
                className="text-xs text-indigo-600 hover:underline disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </Field>

          <Field label="Designation">
            <select {...register("designation_id")} className={inputCls}>
              <option value="">— None —</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newDesig}
                onChange={(e) => setNewDesig(e.target.value)}
                placeholder="New designation…"
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddDesig())}
              />
              <button
                type="button"
                onClick={handleAddDesig}
                disabled={addingDesig || !newDesig.trim()}
                className="text-xs text-indigo-600 hover:underline disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </Field>
        </div>

        {/* Address */}
        <Field label="Address">
          <textarea
            {...register("address")}
            rows={3}
            className={inputCls}
            placeholder="Full address…"
          />
        </Field>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/employees")}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 text-sm bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}
          </button>
        </div>
      </form>
    </div>
  );
}
