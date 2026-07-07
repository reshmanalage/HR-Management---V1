from pydantic import BaseModel, ConfigDict, model_validator


class ShiftBase(BaseModel):
    name: str
    start_time: str | None = None   # "HH:MM"
    end_time: str | None = None     # "HH:MM"
    is_flexible: bool = False
    break_duration_minutes: int = 0
    grace_period_minutes: int = 0
    description: str | None = None
    is_active: bool = True
    half_day_late_cutoff: str | None = None   # null = auto-compute as midpoint
    half_day_early_cutoff: str | None = None  # null = auto-compute as midpoint

    @model_validator(mode="after")
    def validate_times(self) -> "ShiftBase":
        if not self.is_flexible:
            if not self.start_time or not self.end_time:
                raise ValueError("start_time and end_time are required for non-flexible shifts")
        return self


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(BaseModel):
    name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    is_flexible: bool | None = None
    break_duration_minutes: int | None = None
    grace_period_minutes: int | None = None
    description: str | None = None
    is_active: bool | None = None
    half_day_late_cutoff: str | None = None
    half_day_early_cutoff: str | None = None


class ShiftOut(ShiftBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
