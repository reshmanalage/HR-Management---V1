import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class ApprovalAction(str, enum.Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class LeaveApproval(Base):
    __tablename__ = "leave_approvals"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("leave_applications.id", ondelete="CASCADE"))
    approver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[ApprovalAction] = mapped_column(SAEnum(ApprovalAction))
    comment: Mapped[str | None] = mapped_column(Text)
    actioned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    application: Mapped["LeaveApplication"] = relationship("LeaveApplication", back_populates="approvals")
    approver: Mapped["User"] = relationship("User", foreign_keys=[approver_id])
