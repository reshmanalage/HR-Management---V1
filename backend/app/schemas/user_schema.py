from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str | None
    first_name: str
    last_name: str
    email: str
    is_active: bool
    is_locked: bool
    is_email_verified: bool
    created_at: datetime
    roles: list[str] = []


class CreateUserRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    role_id: int
    employee_code: str | None = None
    password: str | None = None  # if set, used directly; otherwise a set-password email is sent
