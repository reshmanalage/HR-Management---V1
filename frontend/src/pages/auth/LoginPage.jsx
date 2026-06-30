import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, Link } from "react-router-dom";
import { login as loginRequest } from "../../services/authService";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const [serverError, setServerError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(values) {
    setServerError("");
    try {
      const tokens = await loginRequest(values);
      login(tokens);
      navigate("/");
    } catch (err) {
      setServerError(err.response?.data?.detail || "Login failed. Please try again.");
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Sign in</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("password", { required: "Password is required" })}
          />
          {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center text-sm text-gray-600 gap-2">
            <input type="checkbox" {...register("remember_me")} />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gray-900 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
