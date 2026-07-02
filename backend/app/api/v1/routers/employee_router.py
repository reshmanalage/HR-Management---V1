import uuid

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import Response
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
    CreateDepartmentRequest,
    CreateDesignationRequest,
    CreateEmployeeRequest,
    DepartmentOut,
    DesignationOut,
    DocumentIn,
    DocumentOut,
    DocumentUploadResponse,
    EmployeeListItem,
    EmployeeOut,
    PhotoUploadResponse,
    UpdateEmployeeRequest,
)
from app.services.employee_service import DepartmentService, DesignationService, EmployeeService
from app.services.google_drive_service import upload_photo
from app.services.bulk_employee_service import generate_template, process_upload

router = APIRouter(tags=["employees"])

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_ALLOWED_DOC_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


# ── Photo upload ─────────────────────────────────────────────────────────────

@router.post("/employees/photo", response_model=PhotoUploadResponse, status_code=201)
async def upload_employee_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission(CREATE_EMPLOYEE)),
):
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, WebP, or GIF images are accepted.")
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Photo must be smaller than 10 MB.")

    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1]
    unique_name = f"emp_photo_{uuid.uuid4().hex}.{ext}"
    photo_url, file_id = upload_photo(file_bytes, unique_name, file.content_type)
    if not photo_url or not file_id:
        raise HTTPException(status_code=503, detail="Photo upload failed. Check Google Drive configuration.")
    return PhotoUploadResponse(photo_url=photo_url, file_id=file_id)


# ── Document upload ───────────────────────────────────────────────────────────

@router.post("/employees/document-upload", response_model=DocumentUploadResponse, status_code=201)
async def upload_employee_document(
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission(CREATE_EMPLOYEE)),
):
    if file.content_type not in _ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=415, detail="Only PDF, Word, or image files are accepted.")
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File must be smaller than 10 MB.")

    original_filename = file.filename or "document"
    ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "pdf"
    unique_name = f"emp_doc_{uuid.uuid4().hex}.{ext}"
    file_url, file_id = upload_photo(file_bytes, unique_name, file.content_type)
    if not file_url or not file_id:
        raise HTTPException(status_code=503, detail="Document upload failed. Check Google Drive configuration.")
    return DocumentUploadResponse(file_url=file_url, file_id=file_id, original_filename=original_filename)


# ── Employees ─────────────────────────────────────────────────────────────────

@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: CreateEmployeeRequest,
    current_user: User = Depends(require_permission(CREATE_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    return EmployeeService(db).create_employee(payload, current_user.id)


@router.get("/employees", response_model=list[EmployeeListItem])
def list_employees(
    current_user: User = Depends(require_permission(VIEW_EMPLOYEES)),
    db: Session = Depends(get_db),
):
    return EmployeeService(db).list_employees()


@router.get("/employees/dropdown", response_model=list[EmployeeListItem])
def employees_dropdown(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lightweight list for reporting manager selector."""
    return EmployeeService(db).list_for_dropdown()


# ── Bulk import ───────────────────────────────────────────────────────────────

@router.get("/employees/bulk-template")
def download_bulk_template(_: User = Depends(get_current_user)):
    xlsx_bytes = generate_template()
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employee_import_template.xlsx"},
    )


@router.post("/employees/bulk-upload")
async def bulk_upload_employees(
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission(CREATE_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    if file.content_type not in (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    ):
        raise HTTPException(400, "Only .xlsx files are accepted")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5 MB)")

    result = process_upload(db, content, created_by=current_user.id)
    return {
        "total": result.total,
        "success": result.success,
        "failed": result.failed,
        "rows": [
            {
                "row": r.row,
                "status": r.status,
                "employee_code": r.employee_code,
                "name": r.name,
                "error": r.error,
            }
            for r in result.rows
        ],
    }


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
    return EmployeeService(db).update_employee(employee_id, payload)


@router.delete("/employees/{employee_id}", status_code=204)
def deactivate_employee(
    employee_id: int,
    current_user: User = Depends(require_permission(DELETE_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    EmployeeService(db).deactivate_employee(employee_id)


# ── Employee documents ────────────────────────────────────────────────────────

@router.post("/employees/{employee_id}/documents", response_model=DocumentOut, status_code=201)
def add_document(
    employee_id: int,
    payload: DocumentIn,
    current_user: User = Depends(require_permission(EDIT_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    return EmployeeService(db).add_document(employee_id, payload)


@router.delete("/employees/{employee_id}/documents/{document_id}", status_code=204)
def delete_document(
    employee_id: int,
    document_id: int,
    current_user: User = Depends(require_permission(EDIT_EMPLOYEE)),
    db: Session = Depends(get_db),
):
    EmployeeService(db).delete_document(employee_id, document_id)


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
