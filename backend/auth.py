"""
auth.py — Real authentication for RailVinyas.

What this actually does:
  - Stores users in a local SQLite database (railvinyas.db), passwords
    hashed with bcrypt (never stored in plain text).
  - Seeds ONE account on first run: aarzubhatt9@gmail.com / aarzu1234 (Admin).
  - /api/auth/register — create a new account (default role: Viewer).
  - /api/auth/login — checks email+password. If the request comes from a
    device_id never seen before for this user, it does NOT log them in
    immediately — it emails a 6-digit OTP to their registered email and
    waits for /api/auth/verify-otp before issuing a real session token.
    This is the "new device" verification behavior you asked for —
    exactly how Gmail/most real apps behave when you sign in somewhere new.
  - Issues JWT tokens (24h expiry) once login/verification succeeds.
  - get_current_user() is a dependency other routes can use to require
    a valid token, and require_role() further restricts by role.

EMAIL SETUP (for OTPs to actually arrive in an inbox):
  Set two environment variables before running the backend:
    GMAIL_ADDRESS       = your Gmail address (the SENDER, e.g. a project Gmail)
    GMAIL_APP_PASSWORD  = a 16-character Gmail "App Password"
                          (Google Account -> Security -> 2-Step Verification
                           -> App Passwords. Your normal Gmail password will
                           NOT work here — Gmail blocks that for SMTP.)
  If these aren't set, the OTP is printed to the backend's console/log
  instead of emailed — so you can still test the full flow locally
  without setting up email first.
"""
import os
import sqlite3
import bcrypt
import jwt
import random
import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
JWT_SECRET = os.environ.get("RAILVINYAS_JWT_SECRET", "dev-secret-change-this-in-production")
JWT_ALGO = "HS256"
JWT_EXPIRY_HOURS = 24
OTP_EXPIRY_MINUTES = 10

DB_PATH = Path(__file__).resolve().parent / "railvinyas.db"

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ------------------------------------------------------------------
# Database setup
# ------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Viewer',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            first_seen TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, device_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    """)
    conn.commit()

    # Seed the one real account, only if it doesn't already exist
    existing = conn.execute("SELECT id FROM users WHERE email = ?", ("aarzubhatt9@gmail.com",)).fetchone()
    if not existing:
        password_hash = bcrypt.hashpw("aarzu1234".encode(), bcrypt.gensalt()).decode()
        conn.execute(
            "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            ("aarzubhatt9@gmail.com", "Aarzu Bhatt", password_hash, "Admin", datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        print("[auth] Seeded admin account: aarzubhatt9@gmail.com")
    conn.close()


# ------------------------------------------------------------------
# Email sending (real Gmail SMTP, with console fallback)
# ------------------------------------------------------------------
def send_otp_email(to_email: str, otp_code: str):
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        print(f"\n{'='*50}\n[DEV MODE - no email configured]")
        print(f"OTP for {to_email}: {otp_code}")
        print(f"(Set GMAIL_ADDRESS + GMAIL_APP_PASSWORD env vars to send real emails)")
        print(f"{'='*50}\n")
        return

    msg = MIMEText(
        f"Your RailVinyas verification code is: {otp_code}\n\n"
        f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n"
        f"If you didn't try to log in, you can ignore this email."
    )
    msg["Subject"] = "RailVinyas — New Device Login Verification"
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = to_email

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.send_message(msg)
        print(f"[auth] OTP email sent to {to_email}")
    except Exception as e:
        # Don't crash the login flow if email fails to send -- fall back to console
        print(f"[auth] EMAIL SEND FAILED ({e}) -- printing OTP instead:")
        print(f"OTP for {to_email}: {otp_code}")


# ------------------------------------------------------------------
# JWT helpers
# ------------------------------------------------------------------
def create_token(user_row) -> str:
    payload = {
        "sub": str(user_row["id"]),
        "email": user_row["email"],
        "name": user_row["name"],
        "role": user_row["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload  # contains sub, email, name, role


def require_role(*allowed_roles):
    def checker(user=Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail=f"Requires one of roles: {allowed_roles}")
        return user
    return checker


# ------------------------------------------------------------------
# Request/response schemas
# ------------------------------------------------------------------
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_id: str   # frontend generates + persists a random UUID per browser/device


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    device_id: str
    otp_code: str


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@router.post("/register")
def register(req: RegisterRequest):
    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    if len(req.password) < 6:
        conn.close()
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    password_hash = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    conn.execute(
        "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
        (req.email, req.name, password_hash, "Viewer", datetime.now(timezone.utc).isoformat())
    )
    conn.commit()
    conn.close()
    return {"message": "Account created. You can now log in.", "role": "Viewer"}


@router.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (req.email,)).fetchone()
    if not user or not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
        conn.close()
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    device = conn.execute(
        "SELECT * FROM devices WHERE user_id = ? AND device_id = ?", (user["id"], req.device_id)
    ).fetchone()

    if device and device["verified"]:
        # Known, already-verified device -> log straight in
        conn.close()
        token = create_token(user)
        return {"status": "success", "token": token, "role": user["role"], "name": user["name"]}

    # New or unverified device -> require OTP
    if not device:
        conn.execute(
            "INSERT INTO devices (user_id, device_id, first_seen, verified) VALUES (?, ?, ?, 0)",
            (user["id"], req.device_id, datetime.now(timezone.utc).isoformat())
        )

    otp_code = f"{random.randint(0, 999999):06d}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
    conn.execute(
        "INSERT INTO otps (user_id, device_id, code, expires_at, used) VALUES (?, ?, ?, ?, 0)",
        (user["id"], req.device_id, otp_code, expires_at)
    )
    conn.commit()
    conn.close()

    send_otp_email(req.email, otp_code)
    return {"status": "verification_required",
            "message": f"New device detected. A verification code has been sent to {req.email}."}


@router.post("/verify-otp")
def verify_otp(req: VerifyOtpRequest):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (req.email,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="Account not found")

    otp_row = conn.execute(
        "SELECT * FROM otps WHERE user_id = ? AND device_id = ? AND code = ? AND used = 0 "
        "ORDER BY id DESC LIMIT 1",
        (user["id"], req.device_id, req.otp_code)
    ).fetchone()

    if not otp_row:
        conn.close()
        raise HTTPException(status_code=400, detail="Incorrect verification code")

    if datetime.fromisoformat(otp_row["expires_at"]) < datetime.now(timezone.utc):
        conn.close()
        raise HTTPException(status_code=400, detail="Verification code has expired, please log in again")

    conn.execute("UPDATE otps SET used = 1 WHERE id = ?", (otp_row["id"],))
    conn.execute(
        "UPDATE devices SET verified = 1 WHERE user_id = ? AND device_id = ?",
        (user["id"], req.device_id)
    )
    conn.commit()
    conn.close()

    token = create_token(user)
    return {"status": "success", "token": token, "role": user["role"], "name": user["name"]}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user
