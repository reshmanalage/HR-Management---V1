from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
