from sqlalchemy.orm import Session

from app.core.exceptions import (
    DepartmentNotFoundError,
    DesignationNotFoundError,
    EmployeeNotFoundError,
)
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.employee_address import EmployeeAddress
from app.models.employee_bank_account import EmployeeBankAccount
from app.models.employee_document import EmployeeDocument
from app.models.employee_statutory import EmployeeStatutory
from app.repositories.employee_repository import (
    DepartmentRepository,
    DesignationRepository,
    EmployeeRepository,
)
from app.schemas.employee_schema import (
    AddressIn,
    BankAccountIn,
    CreateEmployeeRequest,
    DocumentIn,
    StatutoryIn,
    UpdateEmployeeRequest,
)
from app.services.google_drive_service import delete_photo


class EmployeeService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = EmployeeRepository(db)
        self.dept_repo = DepartmentRepository(db)
        self.desig_repo = DesignationRepository(db)

    def _validate_dept(self, dept_id: int | None) -> None:
        if dept_id is not None and self.dept_repo.get_by_id(dept_id) is None:
            raise DepartmentNotFoundError()

    def _validate_desig(self, desig_id: int | None) -> None:
        if desig_id is not None and self.desig_repo.get_by_id(desig_id) is None:
            raise DesignationNotFoundError()

    def _sync_addresses(self, employee: Employee, addresses: list[AddressIn]) -> None:
        employee.addresses.clear()
        for addr in addresses:
            employee.addresses.append(EmployeeAddress(**addr.model_dump()))

    def _sync_bank_accounts(self, employee: Employee, accounts: list[BankAccountIn]) -> None:
        employee.bank_accounts.clear()
        for acct in accounts:
            employee.bank_accounts.append(EmployeeBankAccount(**acct.model_dump()))

    def _sync_statutory(self, employee: Employee, statutory: StatutoryIn | None) -> None:
        if statutory is None:
            return
        if employee.statutory is None:
            employee.statutory = EmployeeStatutory(**statutory.model_dump())
        else:
            for k, v in statutory.model_dump().items():
                setattr(employee.statutory, k, v)

    def create_employee(self, payload: CreateEmployeeRequest, creator_id: int) -> Employee:
        self._validate_dept(payload.department_id)
        self._validate_desig(payload.designation_id)

        employee_code = self.repo.next_employee_code()

        scalar_fields = payload.model_dump(
            exclude={"addresses", "bank_accounts", "statutory"}
        )
        employee = Employee(
            employee_code=employee_code,
            created_by=creator_id,
            # email alias kept for list compat
            email=payload.company_email,
            **scalar_fields,
        )
        self.db.add(employee)
        self.db.flush()

        self._sync_addresses(employee, payload.addresses)
        self._sync_bank_accounts(employee, payload.bank_accounts)
        self._sync_statutory(employee, payload.statutory)

        self.db.commit()
        self.db.refresh(employee)
        return employee

    def update_employee(self, employee_id: int, payload: UpdateEmployeeRequest) -> Employee:
        employee = self.repo.get_by_id(employee_id)
        if employee is None:
            raise EmployeeNotFoundError()

        self._validate_dept(payload.department_id)
        self._validate_desig(payload.designation_id)

        # Replace photo: delete old Drive file if URL changed
        if (
            payload.photo_url is not None
            and payload.photo_url != employee.photo_url
            and employee.photo_drive_file_id
        ):
            delete_photo(employee.photo_drive_file_id)

        scalar_fields = payload.model_dump(
            exclude={"addresses", "bank_accounts", "statutory"},
            exclude_none=True,
        )
        for k, v in scalar_fields.items():
            setattr(employee, k, v)

        if payload.company_email is not None:
            employee.email = payload.company_email

        if payload.addresses is not None:
            self._sync_addresses(employee, payload.addresses)
        if payload.bank_accounts is not None:
            self._sync_bank_accounts(employee, payload.bank_accounts)
        if payload.statutory is not None:
            self._sync_statutory(employee, payload.statutory)

        self.db.commit()
        self.db.refresh(employee)
        return employee

    def get_employee(self, employee_id: int) -> Employee:
        employee = self.repo.get_by_id(employee_id)
        if employee is None:
            raise EmployeeNotFoundError()
        return employee

    def list_employees(self) -> list[Employee]:
        return self.repo.list_all()

    def list_for_dropdown(self) -> list[Employee]:
        return self.repo.list_for_dropdown()

    def deactivate_employee(self, employee_id: int) -> None:
        employee = self.repo.get_by_id(employee_id)
        if employee is None:
            raise EmployeeNotFoundError()
        self.repo.delete(employee)
        self.db.commit()

    def add_document(self, employee_id: int, doc: DocumentIn) -> EmployeeDocument:
        employee = self.repo.get_by_id(employee_id)
        if employee is None:
            raise EmployeeNotFoundError()
        document = EmployeeDocument(employee_id=employee_id, **doc.model_dump())
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document

    def delete_document(self, employee_id: int, document_id: int) -> None:
        from sqlalchemy import select
        doc = self.db.scalar(
            select(EmployeeDocument).where(
                EmployeeDocument.id == document_id,
                EmployeeDocument.employee_id == employee_id,
            )
        )
        if doc and doc.drive_file_id:
            delete_photo(doc.drive_file_id)
        if doc:
            self.db.delete(doc)
            self.db.commit()


class DepartmentService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = DepartmentRepository(db)

    def list_departments(self) -> list[Department]:
        return self.repo.list_all()

    def create_department(self, name: str) -> Department:
        dept = Department(name=name)
        self.repo.save(dept)
        self.db.commit()
        self.db.refresh(dept)
        return dept


class DesignationService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = DesignationRepository(db)

    def list_designations(self) -> list[Designation]:
        return self.repo.list_all()

    def create_designation(self, title: str) -> Designation:
        desig = Designation(title=title)
        self.repo.save(desig)
        self.db.commit()
        self.db.refresh(desig)
        return desig
