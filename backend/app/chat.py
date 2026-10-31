"""Authenticated, household-private family chat with durable update feed.

All mutations are authorized against the cookie's current household. Changes are
published through a PostgreSQL/SQLite log so HTTP clients and WebSockets on
separate workers observe edits, unsends and reactions consistently.
"""
import asyncio
import hashlib
import os
from datetime import timedelta
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from starlette.concurrency import run_in_threadpool
from .db import SessionLocal, get_db
from .models import (FamilyChatMessage, FamilyChatRead, FamilyChatReaction,
                     FamilyChatChange, FamilyChatPresence, Session, User, utc_now)

EMOJIS = {'❤️', '😂', '👍', '😢', '😡'}
ONLINE_SECONDS = 55

class BodyIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator('body')
    @classmethod
    def clean(cls, value):
        if any((ord(char) < 32 and char not in '\n\t') or ord(char) == 127 for char in value):
            raise ValueError('Message contains unsupported control characters')
        value = value.strip()
        if not value:
            raise ValueError('Message cannot be empty')
        return value

class MessageIn(BodyIn):
    client_nonce: str | None = Field(default=None, min_length=8, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    reply_to_id: int | None = Field(default=None, ge=1)

class ReactionIn(BaseModel):
    emoji: str

    @field_validator('emoji')
    @classmethod
    def valid_emoji(cls, emoji):
        if emoji not in EMOJIS:
            raise ValueError('Unsupported reaction')
        return emoji

class ReadIn(BaseModel):
    through_id: int = Field(ge=0)


def iso(value):
    return value.isoformat()+'Z' if value else None


def serialized(db, rows):
    """Batch load reactions and reply previews, including deleted-message tombstones."""
    rows = list(rows)
    if not rows:
        return []
    ids = [m.id for m in rows]
    reactions = db.scalars(select(FamilyChatReaction).where(FamilyChatReaction.message_id.in_(ids))).all()
    grouped = {}
    for reaction in reactions:
        grouped.setdefault(reaction.message_id, []).append({'user_id':reaction.user_id,'emoji':reaction.emoji})
    reply_ids = {m.reply_to_id for m in rows if m.reply_to_id}
    replies = {m.id:m for m in db.scalars(select(FamilyChatMessage).where(FamilyChatMessage.id.in_(reply_ids))).all()} if reply_ids else {}
    result=[]
    for message in rows:
        quote=replies.get(message.reply_to_id)
        if quote and quote.household_id != message.household_id:
            quote=None
        result.append({
            'id':message.id, 'sender_id':message.sender_user_id,
            'sender_name':message.sender_name,
            'body':'' if message.deleted_at else message.body,
            'deleted':bool(message.deleted_at), 'edited_at':iso(message.edited_at),
            'created_at':iso(message.created_at),
            'client_nonce':message.client_nonce,
            'reply_to_id':message.reply_to_id,
            'reply': ({'id':quote.id,'sender_name':quote.sender_name,
                       'body':'Message unsent' if quote.deleted_at else quote.body[:140],
                       'deleted':bool(quote.deleted_at)} if quote else None),
            'reactions':grouped.get(message.id,[])
        })
    return result


def unread_count(db, user):
    cursor = db.get(FamilyChatRead, user.id)
    last_id = cursor.last_read_id if cursor and cursor.household_id == user.household_id else 0
    return db.scalar(select(func.count(FamilyChatMessage.id)).where(
        FamilyChatMessage.household_id == user.household_id,
        FamilyChatMessage.id > last_id,
        FamilyChatMessage.deleted_at.is_(None),
        FamilyChatMessage.sender_user_id.is_distinct_from(user.id)
    )) or 0


def state_data(db, household_id):
    current_members = db.scalars(select(User).where(User.household_id == household_id)).all()
    member_ids = [m.id for m in current_members]
    reads = db.scalars(select(FamilyChatRead).where(FamilyChatRead.household_id == household_id, FamilyChatRead.user_id.in_(member_ids))).all() if member_ids else []
    online = db.scalars(select(FamilyChatPresence).where(
        FamilyChatPresence.household_id == household_id,
        FamilyChatPresence.user_id.in_(member_ids),
        FamilyChatPresence.last_seen_at >= utc_now() - timedelta(seconds=ONLINE_SECONDS))).all() if member_ids else []
    return {'receipts':{str(r.user_id):r.last_read_id for r in reads},
            'online_ids':[p.user_id for p in online]}


def update_feed(db, user, after=0, event_after=0):
    incoming = db.scalars(select(FamilyChatMessage).where(
        FamilyChatMessage.household_id == user.household_id,
        FamilyChatMessage.id > after).order_by(FamilyChatMessage.id).limit(100)).all()
    events = db.scalars(select(FamilyChatChange).where(
        FamilyChatChange.household_id == user.household_id,
        FamilyChatChange.id > event_after).order_by(FamilyChatChange.id).limit(100)).all()
    changed_ids={event.message_id for event in events}
    changed = db.scalars(select(FamilyChatMessage).where(
        FamilyChatMessage.household_id == user.household_id, FamilyChatMessage.id.in_(changed_ids))).all() if changed_ids else []
    state=state_data(db,user.household_id)
    return {'messages':serialized(db,incoming), 'changes':serialized(db,changed),
            'event_cursor':events[-1].id if events else event_after,
            'unread_count':unread_count(db,user), **state}


def append_change(db, message):
    db.add(FamilyChatChange(household_id=message.household_id, message_id=message.id))


def checked_message(db, message_id, user):
    row=db.get(FamilyChatMessage,message_id)
    if not row or row.household_id != user.household_id:
        raise HTTPException(404, 'Message not found')
    return row


def origins_allowed(websocket):
    origin = websocket.headers.get('origin')
    if not origin:
        return False
    parsed = urlsplit(origin)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname:
        return False
    specified = {entry.strip().rstrip('/') for entry in os.getenv('CORS_ORIGINS', '').split(',') if entry.strip()}
    if origin.rstrip('/') in specified:
        return True
    host = websocket.headers.get('host', '').split(':')[0].lower()
    if parsed.hostname.lower() == host and (parsed.port or (443 if parsed.scheme == 'https' else 80)) == (websocket.url.port or (443 if websocket.url.scheme == 'wss' else 80)):
        return True
    return parsed.hostname in ('localhost', '127.0.0.1') and parsed.port == 5173 and host in ('localhost', '127.0.0.1')


def authorized_user(db, cookie):
    if not cookie:
        return None
    session = db.get(Session, hashlib.sha256(cookie.encode()).hexdigest())
    if not session or session.expires_at < utc_now():
        return None
    return db.get(User, session.user_id)


def realtime_batch(cookie, expected_user_id, expected_household, after, event_after):
    with SessionLocal() as db:
        user=authorized_user(db,cookie)
        if not user or user.id != expected_user_id or user.household_id != expected_household:
            return None
        return update_feed(db,user,after,event_after)


def create_chat_router(current_user):
    router=APIRouter(prefix='/api/chat',tags=['family-chat'])

    @router.get('/messages')
    def history(before: int | None = Query(default=None, ge=1), user:User=Depends(current_user), db:DBSession=Depends(get_db)):
        criteria=[FamilyChatMessage.household_id == user.household_id]
        if before is not None:
            criteria.append(FamilyChatMessage.id < before)
        rows=db.scalars(select(FamilyChatMessage).where(*criteria).order_by(FamilyChatMessage.id.desc()).limit(51)).all()
        cursor=db.scalar(select(func.max(FamilyChatChange.id)).where(FamilyChatChange.household_id==user.household_id)) or 0
        return {'messages':serialized(db,reversed(rows[:50])), 'has_more':len(rows)>50, 'event_cursor':cursor, **state_data(db,user.household_id)}

    @router.get('/sync')
    def sync(after:int=Query(default=0,ge=0), events_after:int=Query(default=0,ge=0), user:User=Depends(current_user), db:DBSession=Depends(get_db)):
        return update_feed(db,user,after,events_after)

    @router.get('/unread')
    def unread(user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        return {'unread_count':unread_count(db,user)}

    @router.post('/messages',status_code=201)
    def send(payload:MessageIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        if payload.client_nonce:
            old=db.scalar(select(FamilyChatMessage).where(FamilyChatMessage.household_id==user.household_id,
                FamilyChatMessage.sender_user_id==user.id, FamilyChatMessage.client_nonce==payload.client_nonce))
            if old:return serialized(db,[old])[0]
        reply=None
        if payload.reply_to_id is not None:
            reply=checked_message(db,payload.reply_to_id,user)
            if reply.deleted_at:
                raise HTTPException(400,'Cannot reply to an unsent message')
        recent=db.scalar(select(func.count(FamilyChatMessage.id)).where(
            FamilyChatMessage.household_id==user.household_id,
            FamilyChatMessage.sender_user_id==user.id,
            FamilyChatMessage.created_at>=utc_now()-timedelta(minutes=1))) or 0
        if recent>=30:
            raise HTTPException(429,'Too many chat messages. Please try again shortly')
        message=FamilyChatMessage(household_id=user.household_id,sender_user_id=user.id,
            sender_name=user.name,body=payload.body,client_nonce=payload.client_nonce, reply_to_id=payload.reply_to_id)
        db.add(message)
        try:
            db.flush()
            append_change(db,message)
            db.commit()
        except IntegrityError:
            db.rollback()
            if payload.client_nonce:
                old=db.scalar(select(FamilyChatMessage).where(FamilyChatMessage.household_id==user.household_id,
                    FamilyChatMessage.sender_user_id==user.id,FamilyChatMessage.client_nonce==payload.client_nonce))
                if old:return serialized(db,[old])[0]
            raise
        db.refresh(message)
        return serialized(db,[message])[0]

    @router.patch('/messages/{message_id}')
    def edit(message_id:int,payload:BodyIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        message=checked_message(db,message_id,user)
        if message.sender_user_id!=user.id:raise HTTPException(403,'You can edit only your own messages')
        if message.deleted_at:raise HTTPException(409,'An unsent message cannot be edited')
        message.body=payload.body
        message.edited_at=utc_now()
        append_change(db,message)
        # Also refresh visible quoted previews that reference this message.
        children=db.scalars(select(FamilyChatMessage).where(
            FamilyChatMessage.household_id==user.household_id,
            FamilyChatMessage.reply_to_id==message.id)).all()
        for child in children:append_change(db,child)
        db.commit()
        return serialized(db,[message])[0]

    @router.delete('/messages/{message_id}')
    def unsend(message_id:int,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        message=checked_message(db,message_id,user)
        if message.sender_user_id!=user.id:raise HTTPException(403,'You can unsend only your own messages')
        if not message.deleted_at:
            message.body=''
            message.deleted_at=utc_now()
            db.execute(delete(FamilyChatReaction).where(FamilyChatReaction.message_id==message.id))
            append_change(db,message)
            children=db.scalars(select(FamilyChatMessage).where(
                FamilyChatMessage.household_id==user.household_id,
                FamilyChatMessage.reply_to_id==message.id)).all()
            for child in children:append_change(db,child)
            db.commit()
        return serialized(db,[message])[0]

    @router.put('/messages/{message_id}/reaction')
    def react(message_id:int,payload:ReactionIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        message=checked_message(db,message_id,user)
        if message.deleted_at:raise HTTPException(409,'Cannot react to an unsent message')
        previous=db.scalar(select(FamilyChatReaction).where(FamilyChatReaction.message_id==message.id,FamilyChatReaction.user_id==user.id))
        if previous and previous.emoji==payload.emoji:
            db.delete(previous)
        elif previous:
            previous.emoji=payload.emoji
        else:
            db.add(FamilyChatReaction(message_id=message.id,household_id=user.household_id,user_id=user.id,emoji=payload.emoji))
        db.flush()
        append_change(db,message)
        db.commit()
        return serialized(db,[message])[0]

    @router.post('/read')
    def mark_read(payload:ReadIn,user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        latest=db.scalar(select(func.max(FamilyChatMessage.id)).where(FamilyChatMessage.household_id==user.household_id)) or 0
        through=min(payload.through_id,latest)
        row=db.get(FamilyChatRead,user.id)
        if row and row.household_id!=user.household_id:
            row.last_read_id=0
            row.household_id=user.household_id
        if not row:
            row=FamilyChatRead(user_id=user.id,household_id=user.household_id,last_read_id=0)
            db.add(row)
        row.last_read_id=max(row.last_read_id,through)
        row.updated_at=utc_now()
        db.commit()
        return {'ok':True,'unread_count':unread_count(db,user)}

    @router.post('/presence')
    def heartbeat(user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        row=db.get(FamilyChatPresence,user.id)
        if not row:
            row=FamilyChatPresence(user_id=user.id,household_id=user.household_id)
            db.add(row)
        row.household_id=user.household_id
        row.last_seen_at=utc_now()
        db.commit()
        return {'ok':True}

    @router.delete('/presence')
    def leave(user:User=Depends(current_user),db:DBSession=Depends(get_db)):
        db.execute(delete(FamilyChatPresence).where(FamilyChatPresence.user_id==user.id,FamilyChatPresence.household_id==user.household_id))
        db.commit()
        return {'ok':True}

    clients={}
    @router.websocket('/live')
    async def live(ws:WebSocket,after:int=0,events_after:int=0):
        if not origins_allowed(ws):
            await ws.close(code=1008);return
        cookie=ws.cookies.get('hic_session')
        with SessionLocal() as db:
            user=authorized_user(db,cookie)
            if not user:
                await ws.close(code=1008);return
            user_id,household_id,name=user.id,user.household_id,user.name
        await ws.accept()
        clients.setdefault(household_id,set()).add(ws)
        cursor=max(0,after)
        event_cursor=max(0,events_after)
        last_state=None
        await ws.send_json({'type':'ready'})
        try:
            while True:
                batch=await run_in_threadpool(realtime_batch,cookie,user_id,household_id,cursor,event_cursor)
                if batch is None:
                    await ws.close(code=1008,reason='Session no longer valid');break
                if batch['messages']:
                    cursor=batch['messages'][-1]['id']
                    await ws.send_json({'type':'messages','messages':batch['messages']})
                if batch['changes']:
                    await ws.send_json({'type':'changes','messages':batch['changes']})
                event_cursor=batch['event_cursor']
                state={'receipts':batch['receipts'],'online_ids':batch['online_ids']}
                if last_state is None:
                    last_state=state
                elif state!=last_state:
                    last_state=state
                    await ws.send_json({'type':'state',**state})
                try:
                    data=await asyncio.wait_for(ws.receive_json(),timeout=1.3)
                    if data.get('type')=='typing' and isinstance(data.get('active'),bool):
                        for peer in list(clients.get(household_id,set())):
                            if peer is not ws:
                                try:
                                    await peer.send_json({'type':'typing','user_id':user_id,'name':name,'active':data['active']})
                                except (WebSocketDisconnect,RuntimeError):pass
                except asyncio.TimeoutError:continue
        except (WebSocketDisconnect,RuntimeError):pass
        finally:
            clients.get(household_id,set()).discard(ws)
            if not clients.get(household_id):clients.pop(household_id,None)
    return router
