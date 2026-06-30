"""Bootstrap script: creates base roles/permissions and one Super Admin user.

Run once after migrations, since there is no public registration page:
    python -m app.database.seed
"""
from app.core.security import hash_password
from app.database.session import SessionLocal
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.user_role import UserRole

BASE_PERMISSIONS = [
    ("CREATE_USER", "Create new user accounts", "AUTH"),
    ("VIEW_USERS", "View user list", "AUTH"),
    ("EDIT_USER", "Edit user accounts", "AUTH"),
    ("LOCK_USER", "Lock/unlock user accounts", "AUTH"),
    ("ASSIGN_ROLE", "Assign roles to users", "AUTH"),
    ("MANAGE_ROLES", "Create/edit roles and permissions", "AUTH"),
]

BASE_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE", "EMPLOYEE"]

SUPER_ADMIN_EMAIL = "admin@hrms-app.com"
SUPER_ADMIN_PASSWORD = "ChangeMe123!"


def seed() -> None:
    db = SessionLocal()
    try:
        permissions_by_code = {}
        for code, description, module in BASE_PERMISSIONS:
            existing = db.query(Permission).filter_by(code=code).first()
            if existing is None:
                existing = Permission(code=code, description=description, module=module)
                db.add(existing)
                db.flush()
            permissions_by_code[code] = existing

        roles_by_name = {}
        for name in BASE_ROLES:
            existing = db.query(Role).filter_by(name=name).first()
            if existing is None:
                existing = Role(name=name, description=f"{name.replace('_', ' ').title()} role")
                db.add(existing)
                db.flush()
            roles_by_name[name] = existing

        super_admin_role = roles_by_name["SUPER_ADMIN"]
        for permission in permissions_by_code.values():
            exists = (
                db.query(RolePermission)
                .filter_by(role_id=super_admin_role.id, permission_id=permission.id)
                .first()
            )
            if exists is None:
                db.add(RolePermission(role_id=super_admin_role.id, permission_id=permission.id))

        admin_user = db.query(User).filter_by(email=SUPER_ADMIN_EMAIL).first()
        if admin_user is None:
            admin_user = User(
                first_name="Super",
                last_name="Admin",
                email=SUPER_ADMIN_EMAIL,
                password_hash=hash_password(SUPER_ADMIN_PASSWORD),
                is_active=True,
                is_email_verified=True,
            )
            db.add(admin_user)
            db.flush()

        admin_has_role = (
            db.query(UserRole)
            .filter_by(user_id=admin_user.id, role_id=super_admin_role.id)
            .first()
        )
        if admin_has_role is None:
            db.add(UserRole(user_id=admin_user.id, role_id=super_admin_role.id, assigned_by=admin_user.id))

        db.commit()
        print(f"Seed complete. Super Admin login: {SUPER_ADMIN_EMAIL} / {SUPER_ADMIN_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
