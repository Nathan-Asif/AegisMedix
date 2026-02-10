"""
Authentication module for AegisMedix Cortex using Supabase Auth
"""
import os
from pydantic import BaseModel, EmailStr, field_validator
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# --- Auth Models ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one number')
        return v
    
    @field_validator('full_name')
    @classmethod
    def validate_name(cls, v):
        if len(v.strip()) < 2:
            raise ValueError('Full name must be at least 2 characters')
        return v.strip()

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    success: bool
    message: str
    user: dict | None = None
    access_token: str | None = None
    refresh_token: str | None = None

class TokenVerifyRequest(BaseModel):
    access_token: str


# --- Auth Functions ---
def get_auth_client():
    """Get Supabase client for auth operations"""
    from supabase import create_client
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


async def register_user(request: RegisterRequest) -> AuthResponse:
    """Register a new user with Supabase Auth"""
    try:
        client = get_auth_client()
        
        # Register with Supabase Auth
        response = client.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "full_name": request.full_name
                }
            }
        })
        
        if response.user:
            # Also create entry in patients table
            from database import get_supabase_client
            db = get_supabase_client()
            db.table("patients").insert({
                "id": response.user.id,
                "email": request.email,
                "full_name": request.full_name,
            }).execute()
            
            return AuthResponse(
                success=True,
                message="Registration successful. Please check your email to verify.",
                user={
                    "id": response.user.id,
                    "email": response.user.email,
                    "full_name": request.full_name
                },
                access_token=response.session.access_token if response.session else None,
                refresh_token=response.session.refresh_token if response.session else None
            )
        else:
            return AuthResponse(
                success=False,
                message="Registration failed. Please try again."
            )
            
    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg.lower():
            return AuthResponse(success=False, message="Email already registered")
        return AuthResponse(success=False, message=f"Registration error: {error_msg}")


async def login_user(request: LoginRequest) -> AuthResponse:
    """Login user with Supabase Auth"""
    try:
        client = get_auth_client()
        
        response = client.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        
        if response.user and response.session:
            return AuthResponse(
                success=True,
                message="Login successful",
                user={
                    "id": response.user.id,
                    "email": response.user.email,
                    "full_name": response.user.user_metadata.get("full_name", "")
                },
                access_token=response.session.access_token,
                refresh_token=response.session.refresh_token
            )
        else:
            return AuthResponse(
                success=False,
                message="Invalid credentials"
            )
            
    except Exception as e:
        error_msg = str(e)
        if "invalid" in error_msg.lower():
            return AuthResponse(success=False, message="Invalid email or password")
        return AuthResponse(success=False, message=f"Login error: {error_msg}")


async def verify_token(access_token: str) -> dict | None:
    """Verify JWT token and return user data"""
    try:
        client = get_auth_client()
        response = client.auth.get_user(access_token)
        
        if response.user:
            return {
                "id": response.user.id,
                "email": response.user.email,
                "full_name": response.user.user_metadata.get("full_name", "")
            }
        return None
    except Exception:
        return None


async def logout_user(access_token: str) -> bool:
    """Logout user and invalidate token"""
    try:
        client = get_auth_client()
        client.auth.sign_out()
        return True
    except Exception:
        return False


async def refresh_session(refresh_token: str) -> AuthResponse:
    """Refresh access token using refresh token"""
    try:
        client = get_auth_client()
        response = client.auth.refresh_session(refresh_token)
        
        if response.session:
            return AuthResponse(
                success=True,
                message="Token refreshed",
                access_token=response.session.access_token,
                refresh_token=response.session.refresh_token
            )
        return AuthResponse(success=False, message="Failed to refresh token")
    except Exception as e:
        return AuthResponse(success=False, message=str(e))
