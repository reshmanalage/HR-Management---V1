from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.department import Department
from app.models.designation import Designation


class EmployeeRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, employee_id: int) -> Employee | None:
        return self.db.get(Employee, employee_id)

    def get_by_code(self, code: str) -> Employee | None:
        return self.db.scalar(select(Employee).where(Employee.employee_code == code))

    def get_by_email(self, email: str) -> Employee | None:
        return self.db.scalar(select(Employee).where(Employee.email == email))

    def list_all(self, *, include_inactive: bool = False) -> list[Employee]:
        q = select(Employee).options(
            joinedload(Employee.department),
            joinedload(Employee.designation),
        )
        if not include_inactive:
            q = q.where(Employee.is_active.is_(True))
        q = q.order_by(Employee.first_name, Employee.last_name)
        return list(self.db.scalars(q).unique())

    def next_employee_code(self) -> str:
        result = self.db.scalar(select(func.max(Employee.id)))
        next_id = (result or 0) + 1
        return f"EMP{next_id:04d}"

    def save(self, employee: Employee) -> Employee:
        self.db.add(employee)
        self.db.flush()
        return employee

    def delete(self, employee: Employee) -> None:
        employee.is_active = False
        self.db.flush()


class DepartmentRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[Department]:
        return list(self.db.scalars(select(Department).where(Department.is_active.is_(True)).order_by(Department.name)))

    def get_by_id(self, dept_id: int) -> Department | None:
        return self.db.get(Department, dept_id)

    def get_by_name(self, name: str) -> Department | None:
        return self.db.scalar(select(Department).where(Department.name == name))

    def save(self, dept: Department) -> Department:
        self.db.add(dept)
        self.db.flush()
        return dept


class DesignationRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[Designation]:
        return list(self.db.scalars(select(Designation).where(Designation.is_active.is_(True)).order_by(Designation.title)))

    def get_by_id(self, desig_id: int) -> Designation | None:
        return self.db.get(Designation, desig_id)

    def get_by_title(self, title: str) -> Designation | None:
        return self.db.scalar(select(Designation).where(Designation.title == title))

    def save(self, desig: Designation) -> Designation:
        self.db.add(desig)
        self.db.flush()
        return desig
