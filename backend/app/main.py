"""Home Information Centre. Shared household data, cookie sessions, explicit mutations."""
import hashlib
import calendar
import io
import warnings
import hmac
import os
import re
import secrets
import string
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, EmailStr, field_validator
from sqlalchemy import select, delete, update, text
from sqlalchemy.orm import Session as DBSession
from .db import Base, engine, get_db
from PIL import Image, ImageOps, UnidentifiedImageError
from .models import Household, User, UserAvatar, UserProfilePhoto, Session, Reminder, Announcement, Contact, Energy, Bill, HouseholdDevice, HouseholdTask, HouseholdSunLocation, Preference, FamilyChatMessage, FamilyChatRead, FamilyChatReaction, FamilyChatPresence, FamilyChatChange, utc_now

COOKIE = 'hic_session'
SESSION_DAYS = 7
MAX_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 80_000_000
PHOTO_SIZE = 512
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == 'sqlite':
        # Add the non-destructive fields to existing local chat databases.
        with engine.begin() as connection:
            existing = {row[1] for row in connection.exec_driver_sql('PRAGMA table_info(family_chat_messages)')}
            for column, sql_type in (('reply_to_id', 'INTEGER'), ('edited_at', 'DATETIME'), ('deleted_at', 'DATETIME')):
                if column not in existing:
                    connection.exec_driver_sql(f'ALTER TABLE family_chat_messages ADD COLUMN {column} {sql_type}')
    # Supabase uses PostgreSQL. Secure the newly created private image table
    # against direct PostgREST access; users read photos through FastAPI only.
    if engine.dialect.name == 'postgresql':
        with engine.begin() as connection:
            connection.execute(text('ALTER TABLE public.user_profile_photos ENABLE ROW LEVEL SECURITY'))
            connection.execute(text('ALTER TABLE public.household_tasks ENABLE ROW LEVEL SECURITY'))
            connection.execute(text('ALTER TABLE public.family_chat_messages ENABLE ROW LEVEL SECURITY'))
            connection.execute(text('ALTER TABLE public.family_chat_reads ENABLE ROW LEVEL SECURITY'))
            for chat_table in ('family_chat_reactions', 'family_chat_changes', 'family_chat_presence'):
                connection.execute(text(f'ALTER TABLE public.{chat_table} ENABLE ROW LEVEL SECURITY'))
            for role in ('anon', 'authenticated'):
                if connection.scalar(text('SELECT 1 FROM pg_roles WHERE rolname = :role'), {'role': role}):
                    connection.execute(text(f'REVOKE ALL PRIVILEGES ON TABLE public.user_profile_photos FROM {role}'))
                    connection.execute(text(f'REVOKE ALL PRIVILEGES ON TABLE public.household_tasks FROM {role}'))
                    connection.execute(text(f'REVOKE ALL PRIVILEGES ON TABLE public.family_chat_messages FROM {role}'))
                    connection.execute(text(f'REVOKE ALL PRIVILEGES ON TABLE public.family_chat_reads FROM {role}'))
                    for chat_table in ('family_chat_reactions', 'family_chat_changes', 'family_chat_presence'):
                        connection.execute(text(f'REVOKE ALL PRIVILEGES ON TABLE public.{chat_table} FROM {role}'))
    yield

app = FastAPI(title='Home Information Centre API', version='1.0.0', lifespan=lifespan)
origins = [x.strip() for x in os.getenv('CORS_ORIGINS', '').split(',') if x.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET','POST','PATCH','DELETE','PUT'], allow_headers=['Content-Type','X-HIC-Action'])

@app.middleware('http')
async def mutation_guard(request: Request, call_next):
    if request.url.path.startswith('/api/') and request.method in ('POST','PATCH','DELETE','PUT'):
        if request.headers.get('X-HIC-Action') != '1':
            return Response('Missing application action header', status_code=403)
    return await call_next(request)

class Credentials(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    @field_validator('name')
    @classmethod
    def strip_name(cls, v):
        return v.strip()

class Register(Credentials):
    household_name: str = Field(min_length=2, max_length=100)

class Join(Credentials):
    invite_code: str = Field(min_length=6, max_length=32)

class Login(BaseModel):
    email: EmailStr
    password: str

class AccountNameIn(BaseModel):
    """Personal and household display names; neither changes login credentials."""
    name: str = Field(min_length=2, max_length=100)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        # Collapse accidental double spaces, while allowing normal Unicode names.
        if any(ord(ch) < 32 or ord(ch) == 127 for ch in value if not ch.isspace()):
            raise ValueError('Name contains unsupported control characters')
        value = ' '.join(value.split())
        if len(value) < 2 or len(value) > 100:
            raise ValueError('Enter a name between 2 and 100 characters')
        return value

class ReminderIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    event_date: date
    event_time: str = Field(default='09:00', pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    description: str = Field(default='', max_length=1500)
    category: Literal['Family','School','Health','Other'] = 'Family'

class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=2500)

class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    relation: str = Field(default='Family', max_length=80)
    phone: str = Field(min_length=3, max_length=40)

    @field_validator('phone')
    @classmethod
    def callable_number(cls, value: str) -> str:
        raw = value.strip()
        digits = re.sub(r'\D', '', raw)
        if (not re.fullmatch(r'\+?[\d\s().-]+', raw)
                or not 7 <= len(digits) <= 15
                or digits.startswith('000')
                or len(set(digits)) == 1):
            raise ValueError('Enter a valid phone number (7–15 digits). Placeholder numbers cannot be called.')
        return raw

class EnergyIn(BaseModel):
    month: str = Field(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')
    kwh: float = Field(ge=0, le=1000000)
    cost: float = Field(ge=0, le=100000000)

class BillIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    amount: float = Field(ge=0, le=100000000)
    due_date: date
    category: Literal['Utilities','Groceries','Education','Internet','Other'] = 'Other'
    notes: str = Field(default='', max_length=1000)

TASK_CATEGORIES = Literal['Cleaning', 'Kitchen', 'Errands', 'Maintenance', 'Other']
TASK_PRIORITIES = Literal['low', 'normal', 'high']
TASK_REPEATS = Literal['none', 'daily', 'weekly', 'monthly']
TASK_STATUSES = Literal['pending', 'in_progress', 'completed']

class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=1500)
    category: TASK_CATEGORIES = 'Other'
    priority: TASK_PRIORITIES = 'normal'
    due_date: date
    assigned_to: int | None = Field(default=None, ge=1)
    repeat: TASK_REPEATS = 'none'

    @field_validator('title')
    @classmethod
    def task_title(cls, value):
        value = ' '.join(value.split())
        if not value:
            raise ValueError('Task name cannot be empty')
        return value

class TaskStatusIn(BaseModel):
    status: TASK_STATUSES

class BillStatus(BaseModel):
    status: Literal['paid','unpaid']

AVATAR_CHOICES = tuple(f'{prefix}_{n:02d}' for prefix in ('male', 'female') for n in range(1, 6))

class AvatarChoice(BaseModel):
    avatar_id: str
    @field_validator('avatar_id')
    @classmethod
    def validate_avatar(cls, value):
        if value not in AVATAR_CHOICES:
            raise ValueError('Choose one of the 10 available profile icons')
        return value

DEVICE_TYPES = Literal['Refrigerator', 'Air Conditioner', 'Washing Machine', 'Television', 'Electric Fan', 'Lighting', 'Other']

class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    room: str = Field(min_length=1, max_length=80)
    kind: DEVICE_TYPES = 'Other'
    status: Literal['on', 'off', 'unknown'] = 'unknown'

    @field_validator('name', 'room')
    @classmethod
    def strip_required(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('This field cannot be empty')
        return value

class DeviceStatus(BaseModel):
    status: Literal['on', 'off', 'unknown']

# City-center coordinates for daylight estimates. All supported locations use Asia/Manila.
SUN_CITIES = {
    'butuan': ('Butuan City', 8.9475, 125.5406),
    'cagayan_de_oro': ('Cagayan de Oro', 8.4542, 124.6319),
    'surigao': ('Surigao City', 9.7840, 125.4888),
    'iligan': ('Iligan City', 8.2280, 124.2452),
    'davao': ('Davao City', 7.0731, 125.6128),
    'cebu': ('Cebu City', 10.3157, 123.8854),
    'manila': ('Metro Manila', 14.5995, 120.9842),
    'iloilo': ('Iloilo City', 10.7202, 122.5621),
    'bacolod': ('Bacolod City', 10.6765, 122.9509),
    'baguio': ('Baguio City', 16.4023, 120.5960),
    'zamboanga': ('Zamboanga City', 6.9214, 122.0790),
    'general_santos': ('General Santos', 6.1164, 125.1716),
    'tacloban': ('Tacloban City', 11.2440, 125.0038),
    'dumaguete': ('Dumaguete City', 9.3068, 123.3054),
}

class SunCityInput(BaseModel):
    city_id: str | None = None
    @field_validator('city_id')
    @classmethod
    def known_city(cls, value):
        if value is not None and value not in SUN_CITIES:
            raise ValueError('Choose a city from the supported list')
        return value

def serialize_sun_location(city_id):
    if not city_id or city_id not in SUN_CITIES:
        return None
    name, lat, lng = SUN_CITIES[city_id]
    return {'city_id': city_id, 'name': name, 'lat': lat, 'lng': lng, 'time_zone': 'Asia/Manila'}

class PrefIn(BaseModel):
    # Keep legacy options and the new continuous values in existing VARCHAR(10)
    # fields; no new table/column is required in Supabase PostgreSQL.
    theme: str = Field(max_length=10)
    text_size: str = Field(max_length=10)

    @field_validator('theme')
    @classmethod
    def valid_theme(cls, value):
        if value in ('light', 'dark', 'luxe'):
            return value
        if re.fullmatch(r'mix:(?:[1-9]|[1-9]\d)', value):
            return value
        raise ValueError('Theme must be light, dark, luxe, or a blend between 1 and 99')

    @field_validator('text_size')
    @classmethod
    def valid_text_size(cls, value):
        if value in ('normal', 'large', 'extra'):
            return value
        if re.fullmatch(r'size:(?:1[3-9]\.[0-9]|20\.0)', value):
            return value
        raise ValueError('Text size must be between 13.0 and 20.9 px')

def hash_password(password: str):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 450000)
    return f'pbkdf2_sha256$450000${salt.hex()}${dk.hex()}'

def verify_password(password: str, hashed: str):
    try:
        algo, rounds, salt, digest = hashed.split('$')
        if algo != 'pbkdf2_sha256': return False
        value = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(value, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False

def invite():
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(10))

def set_session(response: Response, db: DBSession, user: User):
    token = secrets.token_urlsafe(32)
    expiry = utc_now() + timedelta(days=SESSION_DAYS)
    db.add(Session(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires_at=expiry))
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, secure=os.getenv('COOKIE_SECURE', '0')=='1', samesite='lax', max_age=SESSION_DAYS*86400, path='/')

def current_user(request: Request, db: DBSession = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, 'Please sign in to continue')
    session = db.get(Session, hashlib.sha256(token.encode()).hexdigest())
    if session is None or session.expires_at < utc_now():
        raise HTTPException(401, 'Your session expired. Please sign in again')
    user = db.get(User, session.user_id)
    if not user: raise HTTPException(401, 'Account not found')
    return user

from .chat import create_chat_router
app.include_router(create_chat_router(current_user))

def household_owner_id(db: DBSession, household_id: int):
    """Household creator is the first registered user; registration precedes joins.

    The existing schema has no owner column. The stable user primary key
    identifies the founding account without changing Supabase records.
    Founder removal is forbidden, so ownership cannot accidentally transfer.
    """
    return db.scalar(select(User.id).where(User.household_id == household_id).order_by(User.id).limit(1))

def info(user: User, db: DBSession):
    h = db.get(Household, user.household_id)
    avatar = db.get(UserAvatar, user.id)
    photo_version = db.scalar(select(UserProfilePhoto.updated_at).where(UserProfilePhoto.user_id == user.id)) if avatar and avatar.avatar_id == 'custom' else None
    return {'id': user.id, 'name': user.name, 'email': user.email, 'avatar_id': avatar.avatar_id if avatar else None,
            'photo_version': photo_version.isoformat() if photo_version else None,
            'is_household_owner': user.id == household_owner_id(db, user.household_id),
            'household': {'id':h.id,'name':h.name,'invite_code':h.invite_code}}

def prevent_duplicate(db, email):
    if db.scalar(select(User).where(User.email == email.lower())):
        raise HTTPException(409, 'An account already uses that email')

def add_user(db, payload, household_id):
    """Stage the new account and defaults; session creation commits them together.

    Register/join previously committed here and again in set_session(), adding
    an unnecessary remote Supabase round trip and leaving a new account created
    without a session if the second commit failed.
    """
    user = User(household_id=household_id, name=payload.name.strip(), email=str(payload.email).lower(), password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    db.add(Preference(user_id=user.id))
    return user

@app.get('/api/health')
def health():
    return {'status':'ok'}

@app.post('/api/auth/register')
def register(payload: Register, response: Response, db: DBSession=Depends(get_db), full: bool = False):
    prevent_duplicate(db, str(payload.email))
    code = invite()
    while db.scalar(select(Household).where(Household.invite_code == code)):
        code = invite()
    household = Household(name=payload.household_name.strip(), invite_code=code)
    db.add(household)
    db.flush()
    user = add_user(db, payload, household.id)
    set_session(response, db, user)
    return bootstrap(user, db) if full else info(user, db)

@app.post('/api/auth/join')
def join(payload: Join, response: Response, db: DBSession=Depends(get_db), full: bool = False):
    prevent_duplicate(db, str(payload.email))
    household = db.scalar(select(Household).where(Household.invite_code == payload.invite_code.strip().upper()))
    if not household: raise HTTPException(400, 'Invalid household invite code')
    user = add_user(db, payload, household.id)
    set_session(response, db, user)
    return bootstrap(user, db) if full else info(user, db)

@app.post('/api/auth/login')
def login(payload: Login, response: Response, db: DBSession=Depends(get_db), full: bool = False):
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, 'Incorrect email or password')
    set_session(response, db, user)
    return bootstrap(user, db) if full else info(user, db)

@app.post('/api/auth/logout')
def logout(request: Request, response: Response, db: DBSession=Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(Session).where(Session.token_hash == hashlib.sha256(token.encode()).hexdigest()))
        db.commit()
    response.delete_cookie(COOKIE, path='/')
    return {'ok':True}

@app.get('/api/auth/me')
def me(user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    return info(user, db)

def check_owned(db, model, ident, user):
    obj = db.get(model, ident)
    if obj is None or obj.household_id != user.household_id:
        raise HTTPException(404, 'Item not found')
    return obj

def serialize_r(r):
    return {'id':r.id,'title':r.title,'event_date':r.event_date,'event_time':r.event_time,'description':r.description,'category':r.category,'is_demo':r.is_demo}
def serialize_a(a):
    return {'id':a.id,'title':a.title,'content':a.content,'posted_at':a.posted_at.isoformat()+'Z','is_demo':a.is_demo}
def serialize_c(c):
    return {'id':c.id,'name':c.name,'relation':c.relation,'phone':c.phone,'is_demo':c.is_demo}
def serialize_e(e):
    return {'id':e.id,'month':e.month,'kwh':e.kwh,'cost':e.cost,'is_demo':e.is_demo}
def serialize_b(b):
    return {'id':b.id,'title':b.title,'category':b.category,'amount':b.amount,'due_date':b.due_date,'status':b.status,'notes':b.notes,'is_demo':b.is_demo}

def serialize_task(task: HouseholdTask):
    return {'id': task.id, 'title': task.title, 'description': task.description,
            'category': task.category, 'priority': task.priority, 'due_date': task.due_date,
            'assigned_to': task.assigned_to, 'created_by': task.created_by,
            'status': task.status, 'repeat': task.repeat,
            'created_at': task.created_at.isoformat() + 'Z' if task.created_at else None,
            'completed_at': task.completed_at.isoformat() + 'Z' if task.completed_at else None}

def validate_assignee(db: DBSession, household_id: int, assignee_id: int | None):
    if assignee_id is None:
        return
    member = db.get(User, assignee_id)
    if not member or member.household_id != household_id:
        raise HTTPException(422, 'Assign this chore to a member of your own household')

def next_recurrence_due(original: str, repeat: str):
    """Find the next scheduled occurrence after today in PH local time.

    Anchors monthly tasks to the original day (e.g. the 31st), clamping only
    months that are shorter. Skips missed periods when a task is finished late.
    """
    previous = date.fromisoformat(original)
    today = datetime.now(timezone(timedelta(hours=8))).date()
    if repeat == 'daily':
        return (max(previous, today) + timedelta(days=1)).isoformat()
    if repeat == 'weekly':
        periods = max(1, ((today - previous).days // 7) + 1)
        return (previous + timedelta(days=7 * periods)).isoformat()
    if repeat == 'monthly':
        months = (today.year - previous.year) * 12 + today.month - previous.month
        offset = max(1, months)
        while True:
            year, month0 = divmod(previous.year * 12 + previous.month - 1 + offset, 12)
            candidate = date(year, month0 + 1, min(previous.day, calendar.monthrange(year, month0 + 1)[1]))
            if candidate > today:
                return candidate.isoformat()
            offset += 1
    return None

def serialize_device(device: HouseholdDevice):
    return {'id': device.id, 'name': device.name, 'room': device.room,
            'kind': device.kind, 'status': device.status,
            'updated_at': device.updated_at.isoformat() + 'Z' if device.updated_at else None}

@app.get('/api/bootstrap')
def bootstrap(user: User=Depends(current_user),db: DBSession=Depends(get_db)):
    hid = user.household_id
    def items(model):
        return db.scalars(select(model).where(model.household_id == hid)).all()
    sun_location = db.get(HouseholdSunLocation, hid)
    pref = db.get(Preference, user.id)
    household_members = db.scalars(select(User).where(User.household_id == hid).order_by(User.id)).all()
    member_ids = [member.id for member in household_members]
    avatar_ids = {a.user_id: a.avatar_id for a in db.scalars(select(UserAvatar).where(UserAvatar.user_id.in_(member_ids))).all()}
    photo_versions = {user_id: updated_at.isoformat() for user_id, updated_at in db.execute(
        select(UserProfilePhoto.user_id, UserProfilePhoto.updated_at).where(UserProfilePhoto.user_id.in_(member_ids))
    ).all()}
    # Members and avatar/photo records are already loaded above. Building the
    # signed-in profile from them avoids redundant remote DB queries from info()
    # for avatar, owner ID and photo version on every dashboard load.
    household = db.get(Household, hid)
    current_avatar = avatar_ids.get(user.id)
    signed_in = {
        'id': user.id, 'name': user.name, 'email': user.email,
        'avatar_id': current_avatar,
        'photo_version': photo_versions.get(user.id) if current_avatar == 'custom' else None,
        'is_household_owner': bool(member_ids) and member_ids[0] == user.id,
        'household': {'id': household.id, 'name': household.name, 'invite_code': household.invite_code},
    }
    return {
        'user': signed_in,
        'members': [{'id': m.id, 'name': m.name, 'avatar_id': avatar_ids.get(m.id),
                     'photo_version': photo_versions.get(m.id) if avatar_ids.get(m.id) == 'custom' else None} for m in household_members],
        'reminders': sorted([serialize_r(x) for x in items(Reminder)], key=lambda x:(x['event_date'],x['event_time'])),
        'announcements': sorted([serialize_a(x) for x in items(Announcement)],key=lambda x:x['posted_at'],reverse=True),
        'contacts':sorted([serialize_c(x) for x in items(Contact)],key=lambda x:x['name'].lower()),
        'energy':sorted([serialize_e(x) for x in items(Energy)],key=lambda x:x['month']),
        'bills':sorted([serialize_b(x) for x in items(Bill)],key=lambda x:x['due_date']),
        'devices': sorted([serialize_device(x) for x in items(HouseholdDevice)], key=lambda x:(x['room'].casefold(),x['name'].casefold(),x['id'])),
        'tasks': sorted([serialize_task(x) for x in items(HouseholdTask)], key=lambda x:(x['status']=='completed',x['due_date'],x['id'])),
        'sun_location': serialize_sun_location(sun_location.city_id if sun_location else None),
        'preferences':{'theme':pref.theme if pref else 'light','text_size':pref.text_size if pref else 'normal'}
    }

class RemoveMemberIn(BaseModel):
    owner_password: str = Field(min_length=1, max_length=128)


@app.delete('/api/household/members/{member_id}')
def delete_household_member(member_id: int, payload: RemoveMemberIn,
                            user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    """Household founder may permanently remove another account in their household.

    Keep shared chores, revoke all sessions, remove the account's personal data,
    and invalidate previously shared invite codes. No other household is touched.
    """
    owner_id = household_owner_id(db, user.household_id)
    if user.id != owner_id:
        raise HTTPException(403, 'Only the household creator can remove family accounts')
    if member_id == owner_id:
        raise HTTPException(403, 'The household creator cannot remove their own account')
    if not verify_password(payload.owner_password, user.password_hash):
        raise HTTPException(403, 'Owner password is incorrect')
    member = db.get(User, member_id)
    if member is None or member.household_id != user.household_id:
        raise HTTPException(404, 'Family member not found in your household')

    # Tasks are household records; they must not be deleted as a side effect.
    # Since created_by is a non-null FK, transfer creator responsibility to the
    # owner and unassign any chores pending for the removed account.
    created_tasks = db.execute(update(HouseholdTask).where(
        HouseholdTask.household_id == user.household_id,
        HouseholdTask.created_by == member_id
    ).values(created_by=owner_id)).rowcount
    assigned_tasks = db.execute(update(HouseholdTask).where(
        HouseholdTask.household_id == user.household_id,
        HouseholdTask.assigned_to == member_id
    ).values(assigned_to=None)).rowcount

    # Preserve messages under their recorded sender name and drop personal references.
    db.execute(update(FamilyChatMessage).where(
        FamilyChatMessage.sender_user_id == member_id,
        FamilyChatMessage.household_id == user.household_id
    ).values(sender_user_id=None))
    db.execute(delete(FamilyChatRead).where(FamilyChatRead.user_id == member_id))
    db.execute(delete(FamilyChatReaction).where(FamilyChatReaction.user_id == member_id, FamilyChatReaction.household_id == user.household_id))
    db.execute(delete(FamilyChatPresence).where(FamilyChatPresence.user_id == member_id))

    # Explicit order is needed: these tables do not use ON DELETE CASCADE.
    for model in (Session, Preference, UserAvatar, UserProfilePhoto):
        key = model.user_id
        db.execute(delete(model).where(key == member_id))
    db.delete(member)

    # An excluded account may still know the old invite code. Rotate it so
    # their previous invitation cannot be reused to create a new login.
    household = db.get(Household, user.household_id)
    new_code = invite()
    while db.scalar(select(Household.id).where(Household.invite_code == new_code)):
        new_code = invite()
    household.invite_code = new_code
    db.commit()
    return {'ok': True, 'removed_member_id': member_id, 'invite_code_rotated': True,
            'transferred_tasks': created_tasks, 'unassigned_tasks': assigned_tasks}


@app.patch('/api/profile/name')
def rename_my_profile(payload: AccountNameIn, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    """Each signed-in member may edit only their own display name."""
    user.name = payload.name
    db.commit()
    return info(user, db)


@app.patch('/api/household/name')
def rename_my_household(payload: AccountNameIn, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    """Only the founding household account may rename the shared space."""
    if user.id != household_owner_id(db, user.household_id):
        raise HTTPException(403, 'Only the household owner can change the household name')
    household = db.get(Household, user.household_id)
    if household is None:
        raise HTTPException(404, 'Household not found')
    household.name = payload.name
    db.commit()
    return info(user, db)


@app.patch('/api/profile/avatar')
def update_my_avatar(payload: AvatarChoice, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    """Only the signed-in user may choose their own icon."""
    avatar = db.get(UserAvatar, user.id)
    if avatar is None:
        avatar = UserAvatar(user_id=user.id, avatar_id=payload.avatar_id)
        db.add(avatar)
    else:
        avatar.avatar_id = payload.avatar_id
    # Selecting a built-in avatar replaces the previous uploaded photo.
    old_photo = db.get(UserProfilePhoto, user.id)
    if old_photo is not None:
        db.delete(old_photo)
    db.commit()
    return {'avatar_id': payload.avatar_id, 'photo_version': None}

@app.put('/api/profile/photo')
def upload_my_profile_photo(photo: UploadFile = File(...), user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    """Accept up to 10 MB, validate pixels, and keep only a small cropped JPEG.

    Browser crops before upload; the server independently verifies all data.
    """
    if photo.content_type not in ('image/jpeg', 'image/png', 'image/webp'):
        raise HTTPException(415, 'Use a JPEG, PNG, or WebP photo')
    raw = photo.file.read(MAX_PHOTO_UPLOAD_BYTES + 1)
    if len(raw) > MAX_PHOTO_UPLOAD_BYTES:
        raise HTTPException(413, 'The photo must be 10 MB or smaller')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ('JPEG', 'PNG', 'WEBP'):
                    raise HTTPException(415, 'Use a JPEG, PNG, or WebP photo')
                if source.width * source.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(413, 'Photo resolution is too large. Choose a smaller photo')
                source.load()
                oriented = ImageOps.exif_transpose(source)
                if 'A' in oriented.getbands() or ('transparency' in oriented.info):
                    rgba = oriented.convert('RGBA')
                    background = Image.new('RGBA', rgba.size, '#ffffff')
                    background.alpha_composite(rgba)
                    image = background.convert('RGB')
                else:
                    image = oriented.convert('RGB')
                image = ImageOps.fit(image, (PHOTO_SIZE, PHOTO_SIZE), method=Image.Resampling.LANCZOS)
                output = io.BytesIO()
                image.save(output, format='JPEG', quality=85, optimize=True)
                optimized = output.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(422, 'The selected photo is invalid or cannot be decoded') from exc
    stored = db.get(UserProfilePhoto, user.id)
    if stored is None:
        stored = UserProfilePhoto(user_id=user.id, photo_jpeg=optimized)
        db.add(stored)
    else:
        stored.photo_jpeg = optimized
    # Unique version also prevents a stale cached image after a rapid replacement.
    stored.updated_at = utc_now()
    avatar = db.get(UserAvatar, user.id)
    if avatar is None:
        db.add(UserAvatar(user_id=user.id, avatar_id='custom'))
    else:
        avatar.avatar_id = 'custom'
    db.commit()
    return {'avatar_id': 'custom', 'photo_version': stored.updated_at.isoformat()}

@app.get('/api/profile/photo/{user_id}')
def get_household_profile_photo(user_id: int, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    member = db.get(User, user_id)
    if member is None or member.household_id != user.household_id:
        raise HTTPException(404, 'Photo not found')
    avatar = db.get(UserAvatar, user_id)
    if not avatar or avatar.avatar_id != 'custom':
        raise HTTPException(404, 'Photo not found')
    stored = db.get(UserProfilePhoto, user_id)
    if not stored:
        raise HTTPException(404, 'Photo not found')
    return Response(content=stored.photo_jpeg, media_type='image/jpeg', headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'
    })

@app.delete('/api/profile/photo')
def remove_my_profile_photo(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    stored = db.get(UserProfilePhoto, user.id)
    if stored is not None:
        db.delete(stored)
    avatar = db.get(UserAvatar, user.id)
    if avatar is not None and avatar.avatar_id == 'custom':
        db.delete(avatar)
    db.commit()
    return {'avatar_id': None, 'photo_version': None}

@app.post('/api/tasks')
def create_task(p: TaskIn, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    if user.id != household_owner_id(db, user.household_id):
        raise HTTPException(403, 'Only the household creator can create or assign chores')
    validate_assignee(db, user.household_id, p.assigned_to)
    task = HouseholdTask(household_id=user.household_id, created_by=user.id,
                         title=p.title, description=p.description.strip(), category=p.category,
                         priority=p.priority, due_date=p.due_date.isoformat(),
                         assigned_to=p.assigned_to, repeat=p.repeat)
    db.add(task); db.commit(); db.refresh(task)
    return serialize_task(task)

@app.patch('/api/tasks/{ident}')
def edit_task(ident: int, p: TaskIn, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    task = check_owned(db, HouseholdTask, ident, user)
    if user.id != household_owner_id(db, user.household_id):
        raise HTTPException(403, 'Only the household creator can edit or reassign chores')
    if task.status == 'completed' and task.repeat != 'none':
        raise HTTPException(409, 'This completed recurring chore is part of your history. Edit the next occurrence instead')
    validate_assignee(db, user.household_id, p.assigned_to)
    task.title=p.title; task.description=p.description.strip(); task.category=p.category
    task.priority=p.priority; task.due_date=p.due_date.isoformat()
    task.assigned_to=p.assigned_to; task.repeat=p.repeat
    db.commit();return serialize_task(task)

@app.patch('/api/tasks/{ident}/status')
def change_task_status(ident: int, p: TaskStatusIn, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    # Lock this row before checking the assignee or changing status. Concurrent
    # requests must not create multiple recurring occurrences in PostgreSQL.
    task = db.scalar(select(HouseholdTask).where(
        HouseholdTask.id == ident, HouseholdTask.household_id == user.household_id
    ).with_for_update())
    if task is None:
        raise HTTPException(404, 'Item not found')
    if task.assigned_to != user.id:
        raise HTTPException(403, 'Only the family member assigned to this chore may change its status. Ask a member to assign it to you first.')
    if task.status == 'completed' and task.repeat != 'none' and p.status != 'completed':
        raise HTTPException(409, 'A new occurrence was already scheduled. Edit that task instead')
    changed = task.status != p.status
    task.status = p.status
    new_occurrence = None
    if p.status == 'completed':
        if changed:
            task.completed_at = utc_now()
        if task.repeat != 'none' and not task.next_created:
            next_due = next_recurrence_due(task.due_date, task.repeat)
            if next_due:
                new_occurrence = HouseholdTask(household_id=task.household_id, created_by=user.id,
                    title=task.title, description=task.description, category=task.category,
                    priority=task.priority, due_date=next_due,
                    assigned_to=task.assigned_to, repeat=task.repeat)
                db.add(new_occurrence)
                task.next_created = True
    else:
        task.completed_at = None
    db.commit()
    # Return the newly created occurrence to the frontend so optimistic status
    # changes need no expensive follow-up /bootstrap request.
    if new_occurrence is not None:
        db.refresh(new_occurrence)
    result = serialize_task(task)
    if new_occurrence is not None:
        result['next_task'] = serialize_task(new_occurrence)
    return result

@app.delete('/api/tasks/{ident}')
def remove_task(ident: int, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    task = check_owned(db, HouseholdTask, ident, user)
    if user.id != household_owner_id(db, user.household_id):
        raise HTTPException(403, 'Only the household creator can delete chores')
    db.delete(task)
    db.commit()
    return {'ok': True}

@app.post('/api/reminders')
def create_reminder(p: ReminderIn, user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    obj=Reminder(household_id=user.household_id,title=p.title.strip(),event_date=p.event_date.isoformat(),event_time=p.event_time,description=p.description.strip(),category=p.category)
    db.add(obj);db.commit();db.refresh(obj)
    return serialize_r(obj)
@app.patch('/api/reminders/{ident}')
def edit_reminder(ident:int,p:ReminderIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    obj=check_owned(db,Reminder,ident,user)
    obj.title=p.title.strip();obj.event_date=p.event_date.isoformat();obj.event_time=p.event_time;obj.description=p.description.strip();obj.category=p.category;obj.is_demo=False
    db.commit();return serialize_r(obj)
@app.delete('/api/reminders/{ident}')
def delete_reminder(ident:int,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    db.delete(check_owned(db,Reminder,ident,user));db.commit();return {'ok':True}

@app.post('/api/announcements')
def create_announcement(p:AnnouncementIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    obj=Announcement(household_id=user.household_id,title=p.title.strip(),content=p.content.strip())
    db.add(obj);db.commit();db.refresh(obj);return serialize_a(obj)
@app.delete('/api/announcements/{ident}')
def delete_announcement(ident:int,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    db.delete(check_owned(db,Announcement,ident,user));db.commit();return {'ok':True}

@app.post('/api/contacts')
def create_contact(p:ContactIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    obj=Contact(household_id=user.household_id,name=p.name.strip(),relation=p.relation.strip(),phone=p.phone.strip())
    db.add(obj);db.commit();db.refresh(obj);return serialize_c(obj)
@app.delete('/api/contacts/{ident}')
def delete_contact(ident:int,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    db.delete(check_owned(db,Contact,ident,user));db.commit();return {'ok':True}

@app.post('/api/energy')
def add_energy(p:EnergyIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    obj=db.scalar(select(Energy).where(Energy.household_id==user.household_id,Energy.month==p.month))
    if obj:
        obj.kwh=p.kwh;obj.cost=p.cost;obj.is_demo=False
    else:
        obj=Energy(household_id=user.household_id,month=p.month,kwh=p.kwh,cost=p.cost)
        db.add(obj)
    db.commit();db.refresh(obj);return serialize_e(obj)

@app.post('/api/bills')
def create_bill(p:BillIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    obj=Bill(household_id=user.household_id,title=p.title.strip(),amount=p.amount,due_date=p.due_date.isoformat(),category=p.category,notes=p.notes.strip())
    db.add(obj);db.commit();db.refresh(obj);return serialize_b(obj)
@app.patch('/api/bills/{ident}/status')
def update_bill(ident:int,p:BillStatus,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    obj=check_owned(db,Bill,ident,user)
    obj.status=p.status
    obj.paid_at=utc_now() if p.status=='paid' else None
    db.commit();return serialize_b(obj)
@app.delete('/api/bills/{ident}')
def delete_bill(ident:int,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    db.delete(check_owned(db,Bill,ident,user));db.commit();return {'ok':True}

@app.post('/api/devices')
def create_device(p: DeviceIn, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    device = HouseholdDevice(household_id=user.household_id, name=p.name, room=p.room,
                             kind=p.kind, status=p.status, updated_at=utc_now())
    db.add(device); db.commit(); db.refresh(device)
    return serialize_device(device)

@app.patch('/api/devices/{ident}')
def edit_device(ident: int, p: DeviceIn, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    device = check_owned(db, HouseholdDevice, ident, user)
    device.name=p.name; device.room=p.room; device.kind=p.kind; device.status=p.status
    device.updated_at=utc_now()
    db.commit()
    return serialize_device(device)

@app.patch('/api/devices/{ident}/status')
def update_device_status(ident: int, p: DeviceStatus, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    device = check_owned(db, HouseholdDevice, ident, user)
    device.status=p.status; device.updated_at=utc_now()
    db.commit()
    return serialize_device(device)

@app.delete('/api/devices/{ident}')
def delete_device(ident: int, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    db.delete(check_owned(db, HouseholdDevice, ident, user)); db.commit()
    return {'ok':True}

@app.patch('/api/household/sun-location')
def save_household_sun_location(p: SunCityInput, user: User=Depends(current_user), db: DBSession=Depends(get_db)):
    """Household members share a city-level selection; no GPS/address is collected."""
    loc = db.get(HouseholdSunLocation, user.household_id)
    if p.city_id is None:
        if loc:
            db.delete(loc)
    elif loc is None:
        db.add(HouseholdSunLocation(household_id=user.household_id, city_id=p.city_id))
    else:
        loc.city_id = p.city_id
    db.commit()
    return serialize_sun_location(p.city_id)

@app.patch('/api/settings')
def update_settings(p:PrefIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    pref=db.get(Preference,user.id)
    if not pref:
        pref=Preference(user_id=user.id);db.add(pref)
    pref.theme=p.theme;pref.text_size=p.text_size;db.commit()
    return {'theme':pref.theme,'text_size':pref.text_size}

@app.post('/api/demo/seed')
def seed_demo(user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    hid=user.household_id
    if any(db.scalar(select(model.id).where(model.household_id==hid).limit(1)) for model in (Reminder,Announcement,Contact,Energy,Bill)):
        raise HTTPException(409,'Demo data can only be loaded into an empty household')
    today=date.today()
    for offset,title,category in [(1,'Family dinner planning','Family'),(3,'School project review','School'),(6,'Weekend grocery trip','Family')]:
        db.add(Reminder(household_id=hid,title=title,event_date=(today+timedelta(days=offset)).isoformat(),event_time='17:30',category=category,description='Sample reminder for preview only',is_demo=True))
    db.add(Announcement(household_id=hid,title='Welcome to your family centre',content='This is an example announcement. Replace demo content with real household updates.',is_demo=True))
    db.add(Contact(household_id=hid,name='Sample Family Contact',relation='Example',phone='000-000-0000',is_demo=True))
    for i,k in enumerate([164,171,158,185,177,149]):
        yr=today.year; month=today.month-(5-i)
        while month<=0: month+=12;yr-=1
        db.add(Energy(household_id=hid,month=f'{yr}-{month:02d}',kwh=k,cost=round(k*11.2,2),is_demo=True))
    for title,amount,days,status in [('Electricity bill',1845,5,'unpaid'),('Internet plan',1499,11,'unpaid'),('Water bill',480,-4,'paid')]:
        db.add(Bill(household_id=hid,title=title,amount=amount,due_date=(today+timedelta(days=days)).isoformat(),category='Utilities',status=status,is_demo=True))
    db.commit();return {'ok':True}

@app.post('/api/demo/rich')
def seed_rich_demo(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    """Add clearly labeled sample records beside real records, without duplicates.

    Only inserts into models with an is_demo flag. Household devices and accounts
    are intentionally excluded: their statuses/identities should never be faked.
    """
    hid = user.household_id
    today = datetime.now(timezone(timedelta(hours=8))).date()  # household cities use PH time
    counts = {'reminders': 0, 'announcements': 0, 'contacts': 0, 'energy': 0, 'bills': 0}

    # Check all titles, even real titles. A real item with the same name should
    # never be overwritten or replaced by a demonstration record.
    reminder_titles = set(db.scalars(select(Reminder.title).where(Reminder.household_id == hid)).all())
    schedule = [
        (0, '18:30', 'Cook a family dinner together', 'Family'),
        (1, '09:00', 'Morning grocery run', 'Family'),
        (1, '19:00', 'Family movie evening', 'Family'),
        (2, '08:30', 'Study group session', 'School'),
        (3, '15:00', 'Sunday meal preparation', 'Family'),
        (4, '17:30', 'Evening neighborhood walk', 'Health'),
        (5, '10:00', 'Household cleaning day', 'Family'),
        (6, '14:00', 'School project presentation', 'School'),
        (7, '07:00', 'Weekend market visit', 'Family'),
        (8, '16:00', 'Visit grandparents', 'Family'),
        (9, '18:00', 'Family game night', 'Family'),
        (10, '09:30', 'Dental checkup reminder', 'Health'),
        (11, '13:00', 'Organize family photographs', 'Family'),
        (12, '08:00', 'School enrollment document check', 'School'),
        (13, '17:00', 'Family exercise time', 'Health'),
        (14, '11:00', 'Plan next week’s meals', 'Family'),
        (15, '19:00', 'Birthday party planning', 'Family'),
        (16, '08:30', 'Review school timetable', 'School'),
        (17, '16:30', 'Prepare household supply list', 'Family'),
        (18, '15:30', 'Community volunteering', 'Other'),
        (20, '10:30', 'Family photo day', 'Family'),
        (22, '07:30', 'Weekend nature walk', 'Health'),
        (24, '18:30', 'Cook a new family recipe', 'Family'),
        (26, '13:00', 'Family budget review', 'Family'),
        (28, '09:00', 'School supplies shopping', 'School'),
        (31, '17:00', 'Monthly family meeting', 'Family'),
        (35, '08:00', 'Plan a weekend outing', 'Family'),
        (40, '15:00', 'Household organizing afternoon', 'Family'),
    ]
    for days, time, title, category in schedule:
        if title in reminder_titles:
            continue
        db.add(Reminder(household_id=hid, title=title,
                        event_date=(today + timedelta(days=days)).isoformat(),
                        event_time=time, category=category,
                        description='Example event for the Haven Home demo. Not a real family commitment.',
                        is_demo=True))
        reminder_titles.add(title)
        counts['reminders'] += 1

    announcement_titles = set(db.scalars(select(Announcement.title).where(Announcement.household_id == hid)).all())
    updates = [
        ('Welcome to your busy family week', 'Sample announcement: Check the calendar for a week of household activities and reminders.'),
        ('Weekend plans are coming together', 'Sample announcement: Review the planned weekend activities and invite family members to suggest ideas.'),
        ('Grocery list ready for review', 'Sample announcement: The weekly grocery planning checklist is ready. This is demonstration content only.'),
        ('Family movie night reminder', 'Sample announcement: Pick a movie and prepare some snacks for a relaxed evening together.'),
        ('Household budget check-in', 'Sample announcement: Remember to review monthly bills and upcoming due dates.'),
        ('Share your favorite family recipes', 'Sample announcement: Collect a few favorite meals for next week’s menu.'),
        ('Study and homework corner', 'Sample announcement: Keep the study area tidy for everyone who needs a quiet space.'),
        ('Take care of our shared spaces', 'Sample announcement: Please return shared items to their storage places.'),
        ('Little things to celebrate', 'Sample announcement: Make time to appreciate family milestones and small achievements.'),
    ]
    for title, content in updates:
        if title in announcement_titles:
            continue
        db.add(Announcement(household_id=hid, title=title, content=content, is_demo=True))
        announcement_titles.add(title)
        counts['announcements'] += 1

    contact_names = set(db.scalars(select(Contact.name).where(Contact.household_id == hid)).all())
    contacts = [
        ('Sample Parent Contact', 'Example parent', '000-000-1011'),
        ('Sample Sibling Contact', 'Example sibling', '000-000-1012'),
        ('Sample Grandparent Contact', 'Example grandparent', '000-000-1013'),
        ('Sample School Adviser', 'Example school contact', '000-000-1014'),
        ('Sample Neighborhood Contact', 'Example neighbor', '000-000-1015'),
        ('Sample Family Friend', 'Example friend', '000-000-1016'),
        ('Sample Home Maintenance Contact', 'Example service', '000-000-1017'),
        ('Sample Community Coordinator', 'Example community', '000-000-1018'),
    ]
    for name, relation, phone in contacts:
        if name in contact_names:
            continue
        db.add(Contact(household_id=hid, name=name, relation=relation,
                       phone=phone, is_demo=True))
        contact_names.add(name)
        counts['contacts'] += 1

    # Energy is unique per household/month. Do not modify existing months,
    # especially if the family has entered their actual electricity figures.
    energy_months = set(db.scalars(select(Energy.month).where(Energy.household_id == hid)).all())
    # Sixteen monthly readings make a meaningful historical trend, while keeping
    # real months untouched. Values are illustrative only.
    monthly_kwh = [146, 162, 174, 168, 192, 181, 205, 198, 178, 164, 190, 211, 223, 199, 185, 216]
    current_index = today.year * 12 + today.month - 1
    for offset, kwh in enumerate(monthly_kwh):
        idx = current_index - (len(monthly_kwh) - offset - 1)
        year, month_idx = divmod(idx, 12)
        month = f'{year}-{month_idx + 1:02d}'
        if month in energy_months:
            continue
        db.add(Energy(household_id=hid, month=month, kwh=float(kwh),
                      cost=round(kwh * 11.25, 2), is_demo=True))
        energy_months.add(month)
        counts['energy'] += 1

    bill_titles = set(db.scalars(select(Bill.title).where(Bill.household_id == hid)).all())
    bills = [
        ('Monthly electricity estimate', 'Utilities', 2225.00, 4, 'unpaid'),
        ('Household water service', 'Utilities', 535.00, 8, 'unpaid'),
        ('Home internet subscription', 'Internet', 1299.00, 12, 'unpaid'),
        ('Weekly groceries budget', 'Groceries', 2100.00, 2, 'unpaid'),
        ('School projects fund', 'Education', 450.00, 15, 'unpaid'),
        ('Family mobile load', 'Other', 399.00, 10, 'unpaid'),
        ('Kitchen supplies budget', 'Groceries', 875.00, 21, 'unpaid'),
        ('Household cleaning supplies', 'Groceries', 325.00, 19, 'unpaid'),
        ('Study materials budget', 'Education', 650.00, 25, 'unpaid'),
        ('Family celebration fund', 'Other', 1500.00, 32, 'unpaid'),
        ('Last month’s internet plan', 'Internet', 1299.00, -24, 'paid'),
        ('Previous grocery trip', 'Groceries', 1730.00, -15, 'paid'),
        ('Last month’s electricity', 'Utilities', 1980.00, -21, 'paid'),
        ('Previous water service', 'Utilities', 510.00, -18, 'paid'),
    ]
    for title, category, amount, days, status in bills:
        if title in bill_titles:
            continue
        db.add(Bill(household_id=hid, title=title, category=category, amount=amount,
                    due_date=(today + timedelta(days=days)).isoformat(), status=status,
                    notes='Example household bill; not a payment request or real obligation.',
                    is_demo=True))
        bill_titles.add(title)
        counts['bills'] += 1

    db.commit()
    return {'ok': True, 'added': counts, 'total_added': sum(counts.values()),
            'note': 'All new records are labeled SAMPLE and can be removed separately.'}


@app.delete('/api/demo')
def clear_demo(user:User=Depends(current_user),db:DBSession=Depends(get_db)):
    for model in (Reminder,Announcement,Contact,Energy,Bill):
        db.execute(delete(model).where(model.household_id==user.household_id,model.is_demo.is_(True)))
    db.commit();return {'ok':True}

# Built frontend is served by the same origin for easy local family access.
DIST=Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
if DIST.exists():
    app.mount('/assets',StaticFiles(directory=str(DIST/'assets')),name='assets')
    @app.get('/{path:path}',include_in_schema=False)
    def spa(path:str):
        target=(DIST/path).resolve()
        if target.is_file() and target.is_relative_to(DIST.resolve()):
            return FileResponse(target)
        return FileResponse(DIST/'index.html')
