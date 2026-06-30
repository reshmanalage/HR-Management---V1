import logging

logger = logging.getLogger("app.email")


def send_password_reset_email(*, to_email: str, reset_link: str) -> None:
    """Dev stub: no SMTP configured yet, so just log the link.

    Swap this out for a real provider (SES/SendGrid/SMTP) later without
    touching callers - the function signature is the integration point.
    """
    logger.info("Password reset link for %s: %s", to_email, reset_link)
    print(f"[email stub] Password reset link for {to_email}: {reset_link}")


def send_welcome_email(*, to_email: str, set_password_link: str) -> None:
    logger.info("Welcome / set-password link for %s: %s", to_email, set_password_link)
    print(f"[email stub] Welcome! Set your password for {to_email}: {set_password_link}")
