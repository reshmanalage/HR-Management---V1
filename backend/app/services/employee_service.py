from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import (
    EmployeeNotFoundError,
    DepartmentNotFoundError,
    DesignationNotFoundError,
)
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee, Gender
from app.repositories.employee_repository import (
    DepartmentRepository,
    DesignationRepository,
    EmployeeRepository,
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

    def create_employee(
        self,
        *,
        creator_id: int,
        first_name: str,
        last_name: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        gender: Optional[Gender] = None,
        date_of_birth: Optional[date] = None,
        date_of_joining: Optional[date] = None,
        department_id: Optional[int] = None,
        designation_id: Optional[int] = None,
        address: Optional[str] = None,
        photo_url: Optional[str] = None,
        photo_drive_file_id: Optional[str] = None,
    ) -> Employee:
        self._validate_dept(department_id)
        self._validate_desig(designation_id)

        employee_code = self.repo.next_employee_code()

        employee = Employee(
            employee_code=employee_code,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone,
            gender=gender,
            date_of_birth=date_of_birth,
            date_of_joining=date_of_joining,
            department_id=department_id,
            designation_id=designation_id,
            address=address,
            photo_url=photo_url,
            photo_drive_file_id=photo_drive_file_id,
            created_by=creator_id,
        )
        self.repo.save(employee)
        self.db.commit()
        self.db.refresh(employee)
        return employee

    def update_employee(self, employee_id: int, **kwargs) -> Employee:
        employee = self.repo.get_by_id(employee_id)
        if employee is None:
            raise EmployeeNotFoundError()

        if "department_id" in kwargs:
            self._validate_dept(kwargs["department_id"])
        if "designation_id" in kwargs:
            self._validate_desig(kwargs["designation_id"])

        # If a new photo is uploaded, clean up the old Drive file
        new_photo_url = kwargs.get("photo_url")
        if new_photo_url and new_photo_url != employee.photo_url and employee.photo_drive_file_id:
            delete_photo(employee.photo_drive_file_id)

        for field, value in kwargs.items():
            if value is not None or field in ("photo_url", "photo_drive_file_id", "email"):
                setattr(employee, field, value)

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

    def deactivate_employee(self, employee_id: int) -> None:
        employee = self.repo.get_by_id(employee_id)
        if employee is None:
            raise EmployeeNotFoundError()
        self.repo.delete(employee)
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
