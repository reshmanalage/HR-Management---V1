from datetime import datetime

from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    employee_code: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user_roles: Mapped[list["UserRole"]] = relationship(
        "UserRole", foreign_keys="UserRole.user_id", back_populates="user", cascade="all, delete-orphan"
    )
    google_account: Mapped["GoogleAccount | None"] = relationship(
        "GoogleAccount", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
