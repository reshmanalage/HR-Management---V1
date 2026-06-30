from sqlalchemy.orm import Session

from app.services.password_service import PasswordService


class PasswordController:
    def __init__(self, db: Session):
        self.password_service = PasswordService(db)

    def forgot_password(self, email: str) -> None:
        self.password_service.request_password_reset(email=email)

    def reset_password(self, token: str, new_password: str) -> None:
        self.password_service.reset_password(token=token, new_password=new_password)

    def change_password(self, user_id: int, current_password: str, new_password: str) -> None:
        self.password_service.change_password(
            user_id=user_id, current_password=current_password, new_password=new_password
        )
