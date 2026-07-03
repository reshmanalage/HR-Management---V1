import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { createUser, listRoles } from "../../services/userService";

export default function CreateUserPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const [roles, setRoles] = useState([]);
  const [serverError, setServerError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    listRoles().then(setRoles);
  }, []);

  async function onSubmit(values) {
    setServerError("");
    try {
      await createUser({ ...values, role_id: Number(values.role_id) });
      navigate("/users");
    } catch (err) {
      setServerError(err.response?.data?.detail || "Could not create user.");
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="text-xl font-semibold mb-4">Create User</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white p-6 rounded shadow">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              {...register("first_name", { required: "Required" })}
            />
            {errors.first_name && <p className="text-xs text-red-600 mt-1">{errors.first_name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              {...register("last_name", { required: "Required" })}
            />
            {errors.last_name && <p className="text-xs text-red-600 mt-1">{errors.last_name.message}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("email", { required: "Email is required" })}
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Employee code (optional)</label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("employee_code")}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password <span className="text-gray-400 font-normal">(optional — leave blank to send set-password email)</span>
          </label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Set an initial password"
            {...register("password")}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("role_id", { required: "Role is required" })}
          >
            <option value="">Select a role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {errors.role_id && <p className="text-xs text-red-600 mt-1">{errors.role_id.message}</p>}
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Creating..." : "Create User"}
        </button>
      </form>
    </div>
  );
}
