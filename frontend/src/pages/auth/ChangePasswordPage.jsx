import { useState } from "react";
import { useForm } from "react-hook-form";
import { changePassword } from "../../services/authService";
import { useAuth } from "../../context/AuthContext";

export default function ChangePasswordPage() {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm();
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const { logout } = useAuth();

  async function onSubmit(values) {
    setServerError("");
    setSuccess(false);
    try {
      await changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      setSuccess(true);
      reset();
      // Changing the password revokes all refresh tokens on the backend,
      // so the current session must re-authenticate too.
      setTimeout(() => logout(), 1500);
    } catch (err) {
      setServerError(err.response?.data?.detail || "Could not change password.");
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="text-xl font-semibold mb-4">Change Password</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white p-6 rounded shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("current_password", { required: "Current password is required" })}
          />
          {errors.current_password && (
            <p className="text-xs text-red-600 mt-1">{errors.current_password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("new_password", {
              required: "New password is required",
              minLength: { value: 8, message: "Must be at least 8 characters" },
            })}
          />
          {errors.new_password && (
            <p className="text-xs text-red-600 mt-1">{errors.new_password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("confirm_password", {
              required: "Please confirm your new password",
              validate: (value) => value === watch("new_password") || "Passwords do not match",
            })}
          />
          {errors.confirm_password && (
            <p className="text-xs text-red-600 mt-1">{errors.confirm_password.message}</p>
          )}
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        {success && (
          <p className="text-sm text-green-600">Password changed. Signing you out for re-login...</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
