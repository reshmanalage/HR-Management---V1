from sqlalchemy.orm import Session

from app.services.email_verification_service import EmailVerificationService


class EmailVerificationController:
    def __init__(self, db: Session):
        self.email_verification_service = EmailVerificationService(db)

    def send_verification_email(self, user_id: int) -> None:
        self.email_verification_service.send_verification_email(user_id=user_id)

    def verify_email(self, token: str) -> None:
        self.email_verification_service.verify_email(token=token)
