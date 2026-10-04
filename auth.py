import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from database import get_db
from models import UserModel, UserSessionModel

SESSION_COOKIE = "nestora_session"
SESSION_DAYS = 14


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    iterations = 310_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return (
        f"pbkdf2_sha256${iterations}$"
        f"{base64.b64encode(salt).decode()}$"
        f"{base64.b64encode(digest).decode()}"
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(iterations)
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def create_session(db: Session, user: UserModel, response: Response) -> None:
    token = secrets.token_urlsafe(40)
    expires = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    db.add(UserSessionModel(token=token, user_id=user.id, expires_at=expires))
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=os.getenv("RENDER") == "true",
    )


def clear_session(db: Session, response: Response, token: str | None) -> None:
    if token:
        db.query(UserSessionModel).filter(UserSessionModel.token == token).delete()
        db.commit()
    response.delete_cookie(SESSION_COOKIE)


def get_user_from_token(db: Session, token: str | None):
    if not token:
        return None
    session = db.query(UserSessionModel).filter(UserSessionModel.token == token).first()
    if not session:
        return None
    if session.expires_at < datetime.utcnow():
        db.delete(session)
        db.commit()
        return None
    return db.query(UserModel).filter(UserModel.id == session.user_id).first()


def current_user_optional(
    nestora_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    return get_user_from_token(db, nestora_session)


def require_user(user=Depends(current_user_optional)):
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue",
        )
    return user
