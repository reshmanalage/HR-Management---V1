from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.models.employee import Gender


class DepartmentOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class DesignationOut(BaseModel):
    id: int
    title: str

    model_config = {"from_attributes": True}


class CreateDepartmentRequest(BaseModel):
    name: str


class CreateDesignationRequest(BaseModel):
    title: str


class CreateEmployeeRequest(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    photo_drive_file_id: Optional[str] = None


class UpdateEmployeeRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    photo_drive_file_id: Optional[str] = None
    is_active: Optional[bool] = None


class EmployeeOut(BaseModel):
    id: int
    employee_code: str
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    date_of_joining: Optional[date] = None
    department: Optional[DepartmentOut] = None
    designation: Optional[DesignationOut] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PhotoUploadResponse(BaseModel):
    photo_url: str
    file_id: str
