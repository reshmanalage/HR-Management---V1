from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.models.employee_salary_revision import EmployeeSalaryRevision
from app.schemas.salary_schema import SalaryRevisionIn


class SalaryService:
    def __init__(self, db: Session):
        self.db = db

    def _get_employee_or_404(self, employee_id: int) -> Employee:
        emp = self.db.get(Employee, employee_id)
        if not emp:
            from fastapi import HTTPException
            raise HTTPException(404, f"Employee {employee_id} not found")
        return emp

    def list_revisions(self, employee_id: int) -> list[EmployeeSalaryRevision]:
        self._get_employee_or_404(employee_id)
        return list(
            self.db.scalars(
                select(EmployeeSalaryRevision)
                .where(EmployeeSalaryRevision.employee_id == employee_id)
                .order_by(EmployeeSalaryRevision.effective_date.desc())
            )
        )

    def add_revision(
        self, employee_id: int, payload: SalaryRevisionIn, created_by: int
    ) -> EmployeeSalaryRevision:
        emp = self._get_employee_or_404(employee_id)

        revision = EmployeeSalaryRevision(
            employee_id=employee_id,
            effective_date=payload.effective_date,
            ctc=payload.ctc,
            basic=payload.basic,
            hra=payload.hra,
            allowances=payload.allowances,
            revision_type=payload.revision_type,
            remarks=payload.remarks,
            created_by=created_by,
        )
        self.db.add(revision)

        # Keep denormalized ctc on employees table in sync (latest by effective_date)
        current_latest = self.db.scalar(
            select(EmployeeSalaryRevision.effective_date)
            .where(EmployeeSalaryRevision.employee_id == employee_id)
            .order_by(EmployeeSalaryRevision.effective_date.desc())
            .limit(1)
        )
        if current_latest is None or payload.effective_date >= current_latest:
            emp.ctc = payload.ctc

        self.db.commit()
        self.db.refresh(revision)
        return revision

    def delete_revision(self, employee_id: int, revision_id: int) -> None:
        self._get_employee_or_404(employee_id)
        revision = self.db.get(EmployeeSalaryRevision, revision_id)
        if not revision or revision.employee_id != employee_id:
            from fastapi import HTTPException
            raise HTTPException(404, "Salary revision not found")
        self.db.delete(revision)
        self.db.flush()

        # Re-sync denormalized ctc after deletion
        latest = self.db.scalar(
            select(EmployeeSalaryRevision.ctc)
            .where(EmployeeSalaryRevision.employee_id == employee_id)
            .order_by(EmployeeSalaryRevision.effective_date.desc())
            .limit(1)
        )
        emp = self.db.get(Employee, employee_id)
        if emp:
            emp.ctc = latest  # None if no revisions left

        self.db.commit()
