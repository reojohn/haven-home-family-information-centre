"""Regression coverage for private household chat, cursors, member removal, WebSocket."""
from fastapi.testclient import TestClient
from backend.app.main import app

HEADERS = {'X-HIC-Action': '1'}


def register(c, name, email):
    response = c.post('/api/auth/register', headers=HEADERS, json={
        'name': name, 'email': email, 'password': 'strongpassword123',
        'household_name': f'{name} Household'})
    assert response.status_code == 200, response.text
    return response.json()


def join(c, name, email, code):
    response = c.post('/api/auth/join', headers=HEADERS, json={
        'name': name, 'email': email, 'password': 'strongpassword123', 'invite_code': code})
    assert response.status_code == 200, response.text
    return response.json()


def post(c, body, nonce='nonceone00001'):
    return c.post('/api/chat/messages', headers=HEADERS, json={'body': body, 'client_nonce': nonce})


def test_chat_private_history_idempotent_send_and_unread():
    with TestClient(app) as owner, TestClient(app) as member, TestClient(app) as outsider:
        alice = register(owner, 'Alice Chat', 'alice-chat@example.com')
        join(member, 'Bob Chat', 'bob-chat@example.com', alice['household']['invite_code'])
        register(outsider, 'Outside Chat', 'outsider-chat@example.com')

        assert owner.get('/api/chat/messages').json()['messages'] == []
        assert owner.get('/api/chat/unread').json()['unread_count'] == 0
        response = post(owner, 'Hello everyone!')
        assert response.status_code == 201, response.text
        posted = response.json()
        assert posted['body'] == 'Hello everyone!'
        assert posted['sender_id'] == alice['id']
        assert post(owner, 'Hello everyone!').json()['id'] == posted['id']  # reconnect retry
        assert owner.get('/api/chat/unread').json()['unread_count'] == 0
        assert member.get('/api/chat/unread').json()['unread_count'] == 1
        assert outsider.get('/api/chat/messages').json()['messages'] == []
        assert outsider.get('/api/chat/sync',params={'after':0}).json()['messages'] == []
        assert member.get('/api/chat/messages').json()['messages'][0]['body'] == 'Hello everyone!'
        assert member.post('/api/chat/read', headers=HEADERS, json={'through_id':posted['id']}).json()['unread_count'] == 0
        assert post(member,'Second message', 'nonceone00002').status_code == 201
        assert owner.get('/api/chat/unread').json()['unread_count'] == 1
        assert member.get('/api/chat/unread').json()['unread_count'] == 0

        assert member.post('/api/chat/messages',json={'body':'No action header'}).status_code == 403
        assert post(owner,'  ').status_code == 422
        assert post(owner,'X'*2001).status_code == 422
        assert post(owner,'Hello\x00bad').status_code == 422
        assert outsider.get('/api/chat/messages',params={'before':posted['id']}).json()['messages'] == []
        assert outsider.post('/api/chat/read',headers=HEADERS,json={'through_id':posted['id']}).json()['unread_count'] == 0


def test_removed_member_cannot_read_chat_messages_are_preserved():
    with TestClient(app) as owner, TestClient(app) as member:
        founder = register(owner, 'Founder Chat', 'founder-chat@example.com')
        guest = join(member,'Guest Chat','guest-chat@example.com',founder['household']['invite_code'])
        msg=post(member,'Please keep this family memory','nonceguest00003')
        assert msg.status_code==201
        no=member.request('DELETE',f'/api/household/members/{founder["id"]}', headers=HEADERS,json={'owner_password':'strongpassword123'})
        assert no.status_code==403
        removed=owner.request('DELETE',f'/api/household/members/{guest["id"]}',headers=HEADERS,json={'owner_password':'strongpassword123'})
        assert removed.status_code==200,removed.text
        assert member.get('/api/chat/messages').status_code==401
        chat=owner.get('/api/chat/messages').json()['messages']
        assert len(chat)==1
        assert chat[0]['sender_name']=='Guest Chat'
        assert chat[0]['sender_id'] is None


def test_chat_websocket_delivers_db_updates_and_blocks_bad_origin():
    with TestClient(app) as owner, TestClient(app) as member:
        founder = register(owner, 'Socket Founder', 'socket-founder@example.com')
        join(member,'Socket Guest','socket-guest@example.com',founder['household']['invite_code'])
        with owner.websocket_connect('/api/chat/live?after=0', headers={'origin':'http://testserver'}) as ws:
            assert ws.receive_json()['type']=='ready'
            r=post(member,'This arrived live', 'noncesocket00004')
            assert r.status_code==201, r.text
            data=ws.receive_json()
            assert data['type']=='messages'
            assert data['messages'][0]['body']=='This arrived live'
