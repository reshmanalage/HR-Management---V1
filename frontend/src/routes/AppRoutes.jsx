import { Routes, Route, Navigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import ProtectedRoute from "./ProtectedRoute";
import LoginPage from "../pages/auth/LoginPage";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage";
import ChangePasswordPage from "../pages/auth/ChangePasswordPage";
import GoogleCallbackPage from "../pages/auth/GoogleCallbackPage";
import VerifyEmailPage from "../pages/auth/VerifyEmailPage";
import UserListPage from "../pages/users/UserListPage";
import CreateUserPage from "../pages/users/CreateUserPage";
import SessionsPage from "../pages/account/SessionsPage";
import LoginHistoryPage from "../pages/account/LoginHistoryPage";
import EmployeeListPage from "../pages/employees/EmployeeListPage";
import EmployeeFormPage from "../pages/employees/EmployeeFormPage";
import EmployeeProfilePage from "../pages/employees/EmployeeProfilePage";
import BulkUploadPage from "../pages/employees/BulkUploadPage";
import LeaveTypesPage from "../pages/leave/LeaveTypesPage";
import HolidaysPage from "../pages/leave/HolidaysPage";
import MyLeavesPage from "../pages/leave/MyLeavesPage";
import LeaveApprovalsPage from "../pages/leave/LeaveApprovalsPage";
import LeaveBalancesPage from "../pages/leave/LeaveBalancesPage";
import RegularizationPage from "../pages/leave/RegularizationPage";
import ShiftsPage from "../pages/shifts/ShiftsPage";
import AttendancePage from "../pages/attendance/AttendancePage";
import AttendanceUploadPage from "../pages/attendance/AttendanceUploadPage";
import PayrollPolicyPage from "../pages/payroll/PayrollPolicyPage";
import LOPReportPage from "../pages/payroll/LOPReportPage";
import PayrollRunsPage from "../pages/payroll/PayrollRunsPage";
import PayrollRunDetailPage from "../pages/payroll/PayrollRunDetailPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>

      <Route path="/auth/google/complete" element={<GoogleCallbackPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Navigate to="/employees" replace />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/login-history" element={<LoginHistoryPage />} />
          <Route path="/users" element={<UserListPage />} />
          <Route path="/users/new" element={<CreateUserPage />} />
          <Route path="/employees" element={<EmployeeListPage />} />
          <Route path="/employees/new" element={<EmployeeFormPage />} />
          <Route path="/employees/bulk-upload" element={<BulkUploadPage />} />
          <Route path="/employees/:id" element={<EmployeeProfilePage />} />
          <Route path="/employees/:id/edit" element={<EmployeeFormPage />} />
          <Route path="/leave/my" element={<MyLeavesPage />} />
          <Route path="/leave/approvals" element={<LeaveApprovalsPage />} />
          <Route path="/leave/types" element={<LeaveTypesPage />} />
          <Route path="/leave/holidays" element={<HolidaysPage />} />
          <Route path="/leave/regularization" element={<RegularizationPage />} />
          <Route path="/leave/balances" element={<LeaveBalancesPage />} />
          <Route path="/shifts" element={<ShiftsPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/attendance/upload" element={<AttendanceUploadPage />} />
          <Route path="/payroll/policy" element={<PayrollPolicyPage />} />
          <Route path="/payroll/lop-report" element={<LOPReportPage />} />
          <Route path="/payroll/runs" element={<PayrollRunsPage />} />
          <Route path="/payroll/runs/:runId" element={<PayrollRunDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
