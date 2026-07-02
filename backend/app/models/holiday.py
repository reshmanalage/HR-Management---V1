import enum
from datetime import date

from sqlalchemy import String, Boolean, Date, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class HolidayType(str, enum.Enum):
    NATIONAL = "national"
    OPTIONAL = "optional"
    RESTRICTED = "restricted"


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    holiday_date: Mapped[date] = mapped_column(Date, unique=True)
    holiday_type: Mapped[HolidayType] = mapped_column(SAEnum(HolidayType), default=HolidayType.NATIONAL)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
