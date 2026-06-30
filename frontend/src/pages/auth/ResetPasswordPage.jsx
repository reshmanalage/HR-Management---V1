import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../services/authService";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm();

  async function onSubmit(values) {
    setServerError("");
    try {
      await resetPassword({ token, new_password: values.new_password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setServerError(err.response?.data?.detail || "Reset link is invalid or expired.");
    }
  }

  if (!token) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Reset Password</h2>
        <p className="text-sm text-red-600">No reset token found in the link. Request a new one.</p>
        <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
          Request new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Password reset</h2>
        <p className="text-sm text-gray-600">Your password has been updated. Redirecting to sign in...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Reset Password</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("confirm_password", {
              required: "Please confirm your password",
              validate: (value) => value === watch("new_password") || "Passwords do not match",
            })}
          />
          {errors.confirm_password && (
            <p className="text-xs text-red-600 mt-1">{errors.confirm_password.message}</p>
          )}
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gray-900 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}
