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


# ============================================================
# CONFIG
# ============================================================

JWT_SECRET = os.environ.get(
    "RAILVINYAS_JWT_SECRET",
    "dev-secret-change-this-in-production",
)

JWT_ALGO = "HS256"
JWT_EXPIRY_HOURS = 24
OTP_EXPIRY_MINUTES = 10

DB_PATH = (
    Path(__file__).resolve().parent
    / "railvinyas.db"
)

GMAIL_ADDRESS = os.environ.get(
    "GMAIL_ADDRESS"
)

GMAIL_APP_PASSWORD = os.environ.get(
    "GMAIL_APP_PASSWORD"
)

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


# ============================================================
# TEAM / SEEDED ACCOUNTS
# ============================================================

SEED_USERS = [
    {
        "email": "aarzubhatt9@gmail.com",
        "name": "Aarzu Bhatt",
        "password": "aarzu1234",
        "role": "Admin",
    },

    {
            "email": "ansh.25007028@kiet.edu",
            "name": "Ansh Insa",
            "password": "ansh1234",
            "role": "Admin",
        },

    {
            "email": "shreya.25004307@kiet.edu",
            "name": "Shreya Pandey",
            "password": "shreya1234",
            "role": "Admin",
        },

    {
            "email": "vishal.25003296@kiet.edu",
            "name": "Vishal Kumar",
            "password": "vishal1234",
            "role": "Admin",
        },

    {
            "email": "vanshika.25004359@kiet.edu",
            "name": "Vanshika Singhal",
            "password": "vanshika1234",
            "role": "Admin",
        },
    {
            "email": "aman.25007177@kiet.edu",
            "name": "Aman Gupta",
            "password": "aman1234",
            "role": "Admin",
        },
]


ALLOWED_ROLES = {
    "Admin",
    "Section Controller",
    "Viewer",
}


# ============================================================
# DATABASE
# ============================================================

def get_db():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=10,
    )

    conn.row_factory = sqlite3.Row

    return conn


def init_db():
    conn = get_db()

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Viewer',
            created_at TEXT NOT NULL,
            is_seeded INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            first_seen TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0,

            UNIQUE(user_id, device_id),

            FOREIGN KEY(user_id)
            REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,

            FOREIGN KEY(user_id)
            REFERENCES users(id)
        );
        """
    )

    conn.commit()

    # --------------------------------------------------------
    # Migration for older database
    # --------------------------------------------------------

    columns = [
        row["name"]
        for row in conn.execute(
            "PRAGMA table_info(users)"
        ).fetchall()
    ]

    if "is_seeded" not in columns:

        conn.execute(
            """
            ALTER TABLE users
            ADD COLUMN is_seeded INTEGER
            NOT NULL DEFAULT 0
            """
        )

        conn.commit()


    # --------------------------------------------------------
    # Seed team accounts
    # --------------------------------------------------------

    for seed in SEED_USERS:

        existing = conn.execute(
            """
            SELECT id, is_seeded
            FROM users
            WHERE email = ?
            """,
            (seed["email"],),
        ).fetchone()


        if not existing:

            password_hash = bcrypt.hashpw(
                seed["password"].encode(),
                bcrypt.gensalt(),
            ).decode()


            conn.execute(
                """
                INSERT INTO users
                (
                    email,
                    name,
                    password_hash,
                    role,
                    created_at,
                    is_seeded
                )
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (
                    seed["email"],
                    seed["name"],
                    password_hash,
                    seed["role"],
                    datetime.now(
                        timezone.utc
                    ).isoformat(),
                ),
            )

            conn.commit()

        elif not existing["is_seeded"]:

            conn.execute(
                """
                UPDATE users
                SET is_seeded = 1
                WHERE id = ?
                """,
                (existing["id"],),
            )

            conn.commit()


    conn.close()


# ============================================================
# EMAIL / OTP
# ============================================================

def send_otp_email(
    to_email: str,
    otp_code: str,
) -> bool:

    # Development/demo mode.
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:

        print(
            "\n"
            + "=" * 60
        )
        print(
            "[DEV MODE] Gmail is not configured."
        )
        print(
            f"OTP for {to_email}: {otp_code}"
        )
        print(
            "Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD "
            "to send real emails."
        )
        print(
            "=" * 60
            + "\n"
        )

        return False


    msg = MIMEText(
        (
            "Your RailVinyas verification code is: "
            f"{otp_code}\n\n"
            f"This code expires in "
            f"{OTP_EXPIRY_MINUTES} minutes.\n\n"
            "If you did not request this login, "
            "you can ignore this email."
        )
    )

    msg["Subject"] = (
        "RailVinyas - Login Verification"
    )

    msg["From"] = GMAIL_ADDRESS
    msg["To"] = to_email


    try:

        with smtplib.SMTP(
            "smtp.gmail.com",
            587,
            timeout=20,
        ) as server:

            server.starttls()

            server.login(
                GMAIL_ADDRESS,
                GMAIL_APP_PASSWORD,
            )

            server.send_message(msg)


        print(
            f"[auth] OTP sent to {to_email}"
        )

        return True


    except Exception as exc:

        print(
            f"[auth] Email failed: {exc}"
        )

        print(
            f"[auth] OTP for {to_email}: "
            f"{otp_code}"
        )

        return False


# ============================================================
# JWT
# ============================================================

def create_token(user_row) -> str:

    payload = {
        "sub": str(user_row["id"]),
        "email": user_row["email"],
        "name": user_row["name"],
        "role": user_row["role"],
        "exp": (
            datetime.now(timezone.utc)
            + timedelta(
                hours=JWT_EXPIRY_HOURS
            )
        ),
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )


def get_current_user(
    authorization: str = Header(None),
):

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header",
        )


    if not authorization.startswith(
        "Bearer "
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header",
        )


    token = authorization.split(
        " ",
        1,
    )[1].strip()


    if not token:
        raise HTTPException(
            status_code=401,
            detail="Empty authentication token",
        )


    try:

        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGO],
        )

        return payload

    except jwt.ExpiredSignatureError:

        raise HTTPException(
            status_code=401,
            detail="Session expired, please log in again",
        )

    except jwt.InvalidTokenError:

        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )


def require_role(*allowed_roles):

    def checker(
        user=Depends(get_current_user)
    ):

        if user["role"] not in allowed_roles:

            raise HTTPException(
                status_code=403,
                detail=(
                    "Requires one of roles: "
                    f"{allowed_roles}"
                ),
            )

        return user

    return checker


# ============================================================
# REQUEST MODELS
# ============================================================

class RegisterRequest(BaseModel):

    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):

    email: EmailStr
    password: str
    device_id: str


class VerifyOtpRequest(BaseModel):

    email: EmailStr
    device_id: str
    otp_code: str


# ============================================================
# REGISTER
# ============================================================

@router.post("/register")
def register(
    req: RegisterRequest
):

    name = req.name.strip()
    email = str(req.email).strip().lower()
    password = req.password


    if not name:

        raise HTTPException(
            status_code=400,
            detail="Name is required",
        )


    if len(name) > 100:

        raise HTTPException(
            status_code=400,
            detail="Name is too long",
        )


    if len(password) < 6:

        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                "6 characters"
            ),
        )


    conn = get_db()


    existing = conn.execute(
        """
        SELECT id
        FROM users
        WHERE email = ?
        """,
        (email,),
    ).fetchone()


    if existing:

        conn.close()

        raise HTTPException(
            status_code=400,
            detail=(
                "An account with this email "
                "already exists"
            ),
        )


    password_hash = bcrypt.hashpw(
        password.encode(),
        bcrypt.gensalt(),
    ).decode()


    conn.execute(
        """
        INSERT INTO users
        (
            email,
            name,
            password_hash,
            role,
            created_at,
            is_seeded
        )
        VALUES (?, ?, ?, 'Viewer', ?, 0)
        """,
        (
            email,
            name,
            password_hash,
            datetime.now(
                timezone.utc
            ).isoformat(),
        ),
    )


    conn.commit()
    conn.close()


    return {
        "status": "success",
        "message": (
            "Account created. "
            "You can now log in."
        ),
        "role": "Viewer",
    }


# ============================================================
# LOGIN
# ============================================================

@router.post("/login")
def login(
    req: LoginRequest
):

    email = str(req.email).strip().lower()
    device_id = req.device_id.strip()


    if not device_id:

        raise HTTPException(
            status_code=400,
            detail="Device ID is required",
        )


    conn = get_db()


    user = conn.execute(
        """
        SELECT *
        FROM users
        WHERE email = ?
        """,
        (email,),
    ).fetchone()


    if not user:

        conn.close()

        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )


    try:

        valid_password = bcrypt.checkpw(
            req.password.encode(),
            user["password_hash"].encode(),
        )

    except Exception:

        valid_password = False


    if not valid_password:

        conn.close()

        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )


    # --------------------------------------------------------
    # Trusted team account
    # --------------------------------------------------------

    if user["is_seeded"]:

        token = create_token(user)

        conn.close()

        return {
            "status": "success",
            "token": token,
            "role": user["role"],
            "name": user["name"],
        }


    # --------------------------------------------------------
    # Registered user -> device verification
    # --------------------------------------------------------

    device = conn.execute(
        """
        SELECT *
        FROM devices
        WHERE user_id = ?
        AND device_id = ?
        """,
        (
            user["id"],
            device_id,
        ),
    ).fetchone()


    # Known verified device.
    if device and device["verified"]:

        token = create_token(user)

        conn.close()

        return {
            "status": "success",
            "token": token,
            "role": user["role"],
            "name": user["name"],
        }


    # --------------------------------------------------------
    # Create device record
    # --------------------------------------------------------

    if not device:

        conn.execute(
            """
            INSERT INTO devices
            (
                user_id,
                device_id,
                first_seen,
                verified
            )
            VALUES (?, ?, ?, 0)
            """,
            (
                user["id"],
                device_id,
                datetime.now(
                    timezone.utc
                ).isoformat(),
            ),
        )


    # --------------------------------------------------------
    # Generate OTP
    # --------------------------------------------------------

    otp_code = f"{random.randint(0, 999999):06d}"

    expires_at = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=OTP_EXPIRY_MINUTES
        )
    ).isoformat()


    # Mark previous unused OTPs for this device
    # as consumed so only the latest code works.
    conn.execute(
        """
        UPDATE otps
        SET used = 1
        WHERE user_id = ?
        AND device_id = ?
        AND used = 0
        """,
        (
            user["id"],
            device_id,
        ),
    )


    conn.execute(
        """
        INSERT INTO otps
        (
            user_id,
            device_id,
            code,
            expires_at,
            used
        )
        VALUES (?, ?, ?, ?, 0)
        """,
        (
            user["id"],
            device_id,
            otp_code,
            expires_at,
        ),
    )


    conn.commit()
    conn.close()


    # --------------------------------------------------------
    # Send OTP
    # --------------------------------------------------------

    was_emailed = send_otp_email(
        email,
        otp_code,
    )


    response = {
        "status":
            "verification_required",

        "message":
            (
                "New device detected. "
                "A verification code has been "
                f"sent to {email}."
            ),
    }


    # Demo fallback.
    if not was_emailed:

        response["dev_otp"] = otp_code

        response["message"] += (
            " Email is not configured yet. "
            "Use the development code shown "
            "in the response."
        )


    return response


# ============================================================
# VERIFY OTP
# ============================================================

@router.post("/verify-otp")
def verify_otp(
    req: VerifyOtpRequest
):

    email = str(req.email).strip().lower()
    device_id = req.device_id.strip()
    otp_code = req.otp_code.strip()


    if not device_id:

        raise HTTPException(
            status_code=400,
            detail="Device ID is required",
        )


    if (
        len(otp_code) != 6
        or not otp_code.isdigit()
    ):

        raise HTTPException(
            status_code=400,
            detail="OTP must be a 6-digit code",
        )


    conn = get_db()


    user = conn.execute(
        """
        SELECT *
        FROM users
        WHERE email = ?
        """,
        (email,),
    ).fetchone()


    if not user:

        conn.close()

        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )


    otp_row = conn.execute(
        """
        SELECT *
        FROM otps
        WHERE user_id = ?
        AND device_id = ?
        AND code = ?
        AND used = 0
        ORDER BY id DESC
        LIMIT 1
        """,
        (
            user["id"],
            device_id,
            otp_code,
        ),
    ).fetchone()


    if not otp_row:

        conn.close()

        raise HTTPException(
            status_code=400,
            detail="Incorrect verification code",
        )


    try:

        expiry = datetime.fromisoformat(
            otp_row["expires_at"]
        )

    except ValueError:

        conn.close()

        raise HTTPException(
            status_code=400,
            detail="Invalid verification code",
        )


    if expiry < datetime.now(timezone.utc):

        conn.close()

        raise HTTPException(
            status_code=400,
            detail=(
                "Verification code has expired, "
                "please log in again"
            ),
        )


    conn.execute(
        """
        UPDATE otps
        SET used = 1
        WHERE id = ?
        """,
        (otp_row["id"],),
    )


    conn.execute(
        """
        UPDATE devices
        SET verified = 1
        WHERE user_id = ?
        AND device_id = ?
        """,
        (
            user["id"],
            device_id,
        ),
    )


    conn.commit()
    conn.close()


    token = create_token(user)


    return {
        "status": "success",
        "token": token,
        "role": user["role"],
        "name": user["name"],
    }


# ============================================================
# CURRENT USER
# ============================================================

@router.get("/me")
def me(
    user=Depends(get_current_user)
):

    return user


# ============================================================
# ADMIN USER LIST
# ============================================================

@router.get("/users")
def list_users(
    user=Depends(
        require_role("Admin")
    )
):

    conn = get_db()


    rows = conn.execute(
        """
        SELECT
            id,
            email,
            name,
            role,
            created_at
        FROM users
        ORDER BY id
        """
    ).fetchall()


    conn.close()


    return [
        dict(row)
        for row in rows
    ]