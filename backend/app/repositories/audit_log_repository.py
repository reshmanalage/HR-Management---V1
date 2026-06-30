from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


class AuditLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        actor_user_id: int | None,
        action: str,
        entity_type: str | None = None,
        entity_id: int | None = None,
        metadata: dict | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        log = AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata,
            ip_address=ip_address,
        )
        self.db.add(log)
        self.db.flush()
        return log
