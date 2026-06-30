from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ip_address: str | None
    user_agent: str | None
    device_label: str | None
    last_active_at: datetime
    created_at: datetime
