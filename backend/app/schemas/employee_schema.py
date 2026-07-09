from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.employee import (
    BloodGroup,
    EmployeeCategory,
    EmployeeStatus,
    EmploymentType,
    Gender,
    MaritalStatus,
    PaymentMode,
)
from app.schemas.shift_schema import ShiftOut
from app.schemas.salary_schema import SalaryRevisionOut


# ── Lookup schemas ────────────────────────────────────────────────────────────

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


# ── Address ───────────────────────────────────────────────────────────────────

class AddressIn(BaseModel):
    address_type: str  # current | permanent
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    landmark: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    country: str = "India"
    postal_code: Optional[str] = None


class AddressOut(AddressIn):
    id: int
    model_config = {"from_attributes": True}


# ── Document ──────────────────────────────────────────────────────────────────

class DocumentIn(BaseModel):
    document_type: str
    document_label: Optional[str] = None
    document_number: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    issuing_authority: Optional[str] = None
    file_url: Optional[str] = None
    drive_file_id: Optional[str] = None
    original_filename: Optional[str] = None


class DocumentOut(DocumentIn):
    id: int
    is_verified: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Bank Account ──────────────────────────────────────────────────────────────

class BankAccountIn(BaseModel):
    bank_name: str
    account_number: str
    ifsc_code: str
    branch_name: Optional[str] = None
    account_holder_name: str
    account_type: str = "savings"
    is_primary: bool = False


class BankAccountOut(BankAccountIn):
    id: int
    is_verified: bool
    model_config = {"from_attributes": True}


# ── Statutory ─────────────────────────────────────────────────────────────────

class StatutoryIn(BaseModel):
    uan_number: Optional[str] = None
    pf_member_id: Optional[str] = None
    pf_eligible: bool = True
    pf_joining_date: Optional[date] = None
    vpf_eligible: bool = False
    eps_eligible: bool = True
    edli_eligible: bool = True
    esic_ip_number: Optional[str] = None
    esic_eligible: bool = True
    esic_joining_date: Optional[date] = None
    esic_dispensary: Optional[str] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    pt_state: Optional[str] = None
    aadhaar_linked: bool = False
    pan_linked: bool = False
    bank_verified: bool = False
    uan_activated: bool = False
    kyc_verified: bool = False


class StatutoryOut(StatutoryIn):
    id: int
    model_config = {"from_attributes": True}


# ── Reporting Manager (lightweight) ───────────────────────────────────────────

class ManagerOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    employee_code: str
    model_config = {"from_attributes": True}


# ── Employee ──────────────────────────────────────────────────────────────────

class CreateEmployeeRequest(BaseModel):
    # Step 1 — Basic Info
    first_name: str
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    blood_group: Optional[BloodGroup] = None
    marital_status: Optional[MaritalStatus] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    photo_url: Optional[str] = None
    photo_drive_file_id: Optional[str] = None

    # Step 2 — Employment
    biometric_code: Optional[str] = None
    date_of_joining: Optional[date] = None
    confirmation_date: Optional[date] = None
    employment_type: Optional[EmploymentType] = None
    employee_category: Optional[EmployeeCategory] = None
    payment_mode: Optional[PaymentMode] = None
    employee_status: EmployeeStatus = EmployeeStatus.ACTIVE
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    reporting_manager_id: Optional[int] = None
    branch: Optional[str] = None
    location: Optional[str] = None
    grade: Optional[str] = None
    shift: Optional[str] = None       # free-text display name (legacy)
    shift_id: Optional[int] = None    # FK to shifts table
    cost_center: Optional[str] = None
    ctc: Optional[float] = None       # annual cost-to-company in INR

    # Step 3 — Contact
    personal_email: Optional[EmailStr] = None
    company_email: Optional[EmailStr] = None
    mobile_number: Optional[str] = None
    alternate_mobile: Optional[str] = None

    # Step 4 — Addresses (current + permanent)
    addresses: list[AddressIn] = []

    # Step 5 — Bank Accounts
    bank_accounts: list[BankAccountIn] = []

    # Step 6 — Statutory
    statutory: Optional[StatutoryIn] = None


class UpdateEmployeeRequest(BaseModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    blood_group: Optional[BloodGroup] = None
    marital_status: Optional[MaritalStatus] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    photo_url: Optional[str] = None
    photo_drive_file_id: Optional[str] = None

    biometric_code: Optional[str] = None
    date_of_joining: Optional[date] = None
    confirmation_date: Optional[date] = None
    employment_type: Optional[EmploymentType] = None
    employee_category: Optional[EmployeeCategory] = None
    payment_mode: Optional[PaymentMode] = None
    employee_status: Optional[EmployeeStatus] = None
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    reporting_manager_id: Optional[int] = None
    branch: Optional[str] = None
    location: Optional[str] = None
    grade: Optional[str] = None
    shift: Optional[str] = None
    shift_id: Optional[int] = None
    cost_center: Optional[str] = None
    ctc: Optional[float] = None

    personal_email: Optional[EmailStr] = None
    company_email: Optional[EmailStr] = None
    mobile_number: Optional[str] = None
    alternate_mobile: Optional[str] = None

    addresses: Optional[list[AddressIn]] = None
    bank_accounts: Optional[list[BankAccountIn]] = None
    statutory: Optional[StatutoryIn] = None

    is_active: Optional[bool] = None


class EmployeeOut(BaseModel):
    id: int
    employee_code: str
    biometric_code: Optional[str] = None
    first_name: str
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    blood_group: Optional[BloodGroup] = None
    marital_status: Optional[MaritalStatus] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    photo_url: Optional[str] = None

    personal_email: Optional[str] = None
    company_email: Optional[str] = None
    mobile_number: Optional[str] = None
    alternate_mobile: Optional[str] = None

    date_of_joining: Optional[date] = None
    confirmation_date: Optional[date] = None
    employment_type: Optional[EmploymentType] = None
    employee_category: Optional[EmployeeCategory] = None
    payment_mode: Optional[PaymentMode] = None
    employee_status: EmployeeStatus = EmployeeStatus.ACTIVE
    department: Optional[DepartmentOut] = None
    designation: Optional[DesignationOut] = None
    reporting_manager: Optional[ManagerOut] = None
    branch: Optional[str] = None
    location: Optional[str] = None
    grade: Optional[str] = None
    shift: Optional[str] = None
    shift_id: Optional[int] = None
    shift_obj: Optional[ShiftOut] = None
    cost_center: Optional[str] = None
    ctc: Optional[float] = None

    addresses: list[AddressOut] = []
    bank_accounts: list[BankAccountOut] = []
    statutory: Optional[StatutoryOut] = None
    salary_revisions: list[SalaryRevisionOut] = []

    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class EmployeeListItem(BaseModel):
    """Lightweight shape used in list view and reporting manager dropdown."""
    id: int
    employee_code: str
    first_name: str
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    department: Optional[DepartmentOut] = None
    designation: Optional[DesignationOut] = None
    employee_status: EmployeeStatus = EmployeeStatus.ACTIVE
    employment_type: Optional[EmploymentType] = None
    employee_category: Optional[EmployeeCategory] = None
    date_of_joining: Optional[date] = None
    mobile_number: Optional[str] = None
    company_email: Optional[str] = None
    model_config = {"from_attributes": True}


class PhotoUploadResponse(BaseModel):
    photo_url: str
    file_id: str


class DocumentUploadResponse(BaseModel):
    file_url: str
    file_id: str
    original_filename: str
