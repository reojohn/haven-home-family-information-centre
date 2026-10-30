from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Float, ForeignKey, Boolean, Text, UniqueConstraint, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class Household(Base):
    __tablename__ = 'households'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(250))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class UserAvatar(Base):
    """An optional, per-account avatar choice; existing users require no migration."""
    __tablename__ = 'user_avatars'
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    avatar_id: Mapped[str] = mapped_column(String(20))

class UserProfilePhoto(Base):
    """Small, server-optimized private photo; never store the full original upload."""
    __tablename__ = 'user_profile_photos'
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    photo_jpeg: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

class Session(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)

class Reminder(Base):
    __tablename__ = 'reminders'
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    event_date: Mapped[str] = mapped_column(String(10))
    event_time: Mapped[str] = mapped_column(String(5), default='09:00')
    description: Mapped[str] = mapped_column(Text, default='')
    category: Mapped[str] = mapped_column(String(30), default='Family')
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

class Announcement(Base):
    __tablename__ = 'announcements'
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    content: Mapped[str] = mapped_column(Text)
    posted_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

class Contact(Base):
    __tablename__ = 'contacts'
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    name: Mapped[str] = mapped_column(String(100))
    relation: Mapped[str] = mapped_column(String(80), default='Family')
    phone: Mapped[str] = mapped_column(String(40))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

class Energy(Base):
    __tablename__ = 'energy_records'
    __table_args__ = (UniqueConstraint('household_id', 'month', name='unique_household_month'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    month: Mapped[str] = mapped_column(String(7))
    kwh: Mapped[float] = mapped_column(Float)
    cost: Mapped[float] = mapped_column(Float, default=0)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

class Bill(Base):
    __tablename__ = 'bills'
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40), default='Other')
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default='unpaid')
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default='')
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

class HouseholdDevice(Base):
    """Household-scoped manually recorded appliance status; no device control."""
    __tablename__ = 'household_devices'
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    name: Mapped[str] = mapped_column(String(100))
    room: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(30), default='Other')
    status: Mapped[str] = mapped_column(String(10), default='unknown')
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

class HouseholdTask(Base):
    """Shared chores; historical completions are retained as individual rows."""
    __tablename__ = 'household_tasks'
    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default='')
    category: Mapped[str] = mapped_column(String(30), default='Other')
    priority: Mapped[str] = mapped_column(String(10), default='normal')
    due_date: Mapped[str] = mapped_column(String(10))
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    status: Mapped[str] = mapped_column(String(20), default='pending')
    repeat: Mapped[str] = mapped_column(String(10), default='none')
    # A completed occurrence spawns one next occurrence. Never do this twice.
    next_created: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class Preference(Base):
    __tablename__ = 'preferences'
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    theme: Mapped[str] = mapped_column(String(10), default='light')
    text_size: Mapped[str] = mapped_column(String(10), default='normal')


class HouseholdSunLocation(Base):
    """Optional city-level location shared by one household (not a precise address)."""
    __tablename__ = 'household_sun_locations'
    household_id: Mapped[int] = mapped_column(ForeignKey('households.id'), primary_key=True)
    city_id: Mapped[str] = mapped_column(String(40))
