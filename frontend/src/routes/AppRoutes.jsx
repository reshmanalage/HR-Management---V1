import { Routes, Route, Navigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import ProtectedRoute from "./ProtectedRoute";
import LoginPage from "../pages/auth/LoginPage";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage";
import ChangePasswordPage from "../pages/auth/ChangePasswordPage";
import GoogleCallbackPage from "../pages/auth/GoogleCallbackPage";
import UserListPage from "../pages/users/UserListPage";
import CreateUserPage from "../pages/users/CreateUserPage";
import SessionsPage from "../pages/account/SessionsPage";
import LoginHistoryPage from "../pages/account/LoginHistoryPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route path="/auth/google/complete" element={<GoogleCallbackPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Navigate to="/users" replace />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/login-history" element={<LoginHistoryPage />} />
          <Route path="/users" element={<UserListPage />} />
          <Route path="/users/new" element={<CreateUserPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
