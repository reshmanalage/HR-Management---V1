class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class InvalidCredentialsError(AppError):
    def __init__(self):
        super().__init__("Invalid email or password", status_code=401)


class AccountLockedError(AppError):
    def __init__(self):
        super().__init__("Account is locked due to too many failed login attempts", status_code=423)


class AccountInactiveError(AppError):
    def __init__(self):
        super().__init__("Account is inactive", status_code=403)


class InvalidTokenError(AppError):
    def __init__(self, message: str = "Invalid or expired token"):
        super().__init__(message, status_code=401)


class PermissionDeniedError(AppError):
    def __init__(self, permission_code: str):
        super().__init__(f"Missing required permission: {permission_code}", status_code=403)


class EmailAlreadyExistsError(AppError):
    def __init__(self):
        super().__init__("A user with this email already exists", status_code=409)


class RoleNotFoundError(AppError):
    def __init__(self):
        super().__init__("Role not found", status_code=404)


class UserNotFoundError(AppError):
    def __init__(self):
        super().__init__("User not found", status_code=404)


class SessionNotFoundError(AppError):
    def __init__(self):
        super().__init__("Session not found", status_code=404)


class EmployeeNotFoundError(AppError):
    def __init__(self):
        super().__init__("Employee not found", status_code=404)


class EmployeeCodeAlreadyExistsError(AppError):
    def __init__(self):
        super().__init__("An employee with this code already exists", status_code=409)


class DepartmentNotFoundError(AppError):
    def __init__(self):
        super().__init__("Department not found", status_code=404)


class DesignationNotFoundError(AppError):
    def __init__(self):
        super().__init__("Designation not found", status_code=404)


class GoogleAccountNotProvisionedError(AppError):
    def __init__(self):
        super().__init__(
            "No account found for this Google email. Contact your administrator to get access.",
            status_code=403,
        )
