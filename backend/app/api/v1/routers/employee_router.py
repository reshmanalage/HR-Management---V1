import uuid

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_permission
from app.core.permissions import (
    CREATE_EMPLOYEE,
    VIEW_EMPLOYEES,
    EDIT_EMPLOYEE,
    DELETE_EMPLOYEE,
    MANAGE_DEPARTMENTS,
    MANAGE_DESIGNATIONS,
)
from app.database.session import get_db
from app.models.user import User
from app.schemas.employee_schema import (
    CreateEmployeeRequest,
    UpdateEmployeeRequest,
    EmployeeOut,
    DepartmentOut,
    DesignationOut,
    CreateDepartmentRequest,
    CreateDesignationRequest,
    PhotoUploadResponse,
)
from app.services.employee_service import DepartmentService, DesignationService, EmployeeService
from app.services.google_drive_service import upload_photo

router = APIRouter(tags=["employees"])

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB


# ── Photo upload ─────────────────────────────────────────────────────────────

@router.post("/employees/photo", response_model=PhotoUploadResponse, status_code=201)
async def upload_employee_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission(CREATE_EMPLOYEE)),
):
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, WebP, or GIF images are accepted.")

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Photo must be smaller than 5 MB.")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    unique_name = f"emp_{uuid.uuid4().hex}.{ext}"

    photo_url, file_id = upload_photo(file_bytes, unique_name, file.content_type)
    if not photo_url or not file_id:
        raise HTTPException(
            status_code=503,
            detail="Photo upload is not configured yet. Set up Google Drive service account first.",
        )

    return PhotoUploadResponse(photo_url=photo_url, file_id=file_id)


# ── Employees ─────────────────────────────────────────────────────────────────

@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: CreateEmployeeRequest,
    current_user: User = Depends(require_permission(CREATE_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    return EmployeeService(db).create_employee(
        creator_id=current_user.id,
        **payload.model_dump(),
    )


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(
    current_user: User = Depends(require_permission(VIEW_EMPLOYEES)),
    db: Session = Depends(get_db),
):
    return EmployeeService(db).list_employees()


@router.get("/employees/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: int,
    current_user: User = Depends(require_permission(VIEW_EMPLOYEES)),
    db: Session = Depends(get_db),
):
    return EmployeeService(db).get_employee(employee_id)


@router.put("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: UpdateEmployeeRequest,
    current_user: User = Depends(require_permission(EDIT_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    return EmployeeService(db).update_employee(employee_id, **updates)


@router.delete("/employees/{employee_id}", status_code=204)
def deactivate_employee(
    employee_id: int,
    current_user: User = Depends(require_permission(DELETE_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    EmployeeService(db).deactivate_employee(employee_id)


# ── Departments ───────────────────────────────────────────────────────────────

@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return DepartmentService(db).list_departments()


@router.post("/departments", response_model=DepartmentOut, status_code=201)
def create_department(
    payload: CreateDepartmentRequest,
    current_user: User = Depends(require_permission(MANAGE_DEPARTMENTS)),
    db: Session = Depends(get_db),
):
    return DepartmentService(db).create_department(payload.name)


# ── Designations ──────────────────────────────────────────────────────────────

@router.get("/designations", response_model=list[DesignationOut])
def list_designations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return DesignationService(db).list_designations()


@router.post("/designations", response_model=DesignationOut, status_code=201)
def create_designation(
    payload: CreateDesignationRequest,
    current_user: User = Depends(require_permission(MANAGE_DESIGNATIONS)),
    db: Session = Depends(get_db),
):
    return DesignationService(db).create_designation(payload.title)
