"""Security regression tests for founder-controlled permanent member removal."""
import os
import tempfile
from pathlib import Path

_tmp = tempfile.TemporaryDirectory(prefix='hic_member_removal_')
os.environ.setdefault('DATABASE_URL', 'sqlite:///' + str(Path(_tmp.name) / 'members.sqlite3'))
from fastapi.testclient import TestClient
from backend.app.main import app

HEADERS = {'X-HIC-Action': '1'}
CONFIRM = {'owner_password': 'safe-password-123'}

def register(client, name, email):
    resp = client.post('/api/auth/register', json={
        'name': name, 'email': email, 'password': 'safe-password-123',
        'household_name': f'{name} Household'
    }, headers=HEADERS)
    assert resp.status_code == 200, resp.text
    return resp.json()

def join(client, invite_code, name, email):
    return client.post('/api/auth/join', json={
        'name': name, 'email': email, 'password': 'safe-password-123',
        'invite_code': invite_code
    }, headers=HEADERS)

def test_owner_can_remove_member_securely_without_losing_shared_records():
    with TestClient(app) as owner, TestClient(app) as member, TestClient(app) as outsider, TestClient(app) as fresh:
        founder = register(owner, 'Member Admin', 'member-admin-test@hic.example')
        outsider_account = register(outsider, 'Other Owner', 'outside-admin-test@hic.example')
        code = founder['household']['invite_code']
        added = join(member, code, 'Wrong Member', 'wrong-member-test@hic.example')
        assert added.status_code == 200, added.text
        member_id = added.json()['id']
        assert member.get('/api/bootstrap').status_code == 200

        # Owner's shared household records survive the account removal.
        bill = owner.post('/api/bills', json={
            'title': 'Shared bill', 'amount': 500, 'due_date': '2026-11-15'
        }, headers=HEADERS)
        assert bill.status_code == 200
        chore = owner.post('/api/tasks', json={
            'title': 'Family chore', 'due_date': '2026-11-15', 'assigned_to': member_id
        }, headers=HEADERS)
        assert chore.status_code == 200, chore.text
        task_id = chore.json()['id']

        assert owner.delete(f'/api/household/members/{member_id}').status_code == 403
        assert member.request('DELETE', f'/api/household/members/{founder["id"]}', json=CONFIRM, headers=HEADERS).status_code == 403
        assert owner.request('DELETE', f'/api/household/members/{founder["id"]}', json=CONFIRM, headers=HEADERS).status_code == 403
        assert outsider.request('DELETE', f'/api/household/members/{member_id}', json=CONFIRM, headers=HEADERS).status_code == 404
        assert owner.request('DELETE', f'/api/household/members/{outsider_account["id"]}', json=CONFIRM, headers=HEADERS).status_code == 404

        assert owner.request('DELETE', f'/api/household/members/{member_id}', json={'owner_password': 'incorrect'}, headers=HEADERS).status_code == 403
        assert member.get('/api/bootstrap').status_code == 200
        deleted = owner.request('DELETE', f'/api/household/members/{member_id}', json=CONFIRM, headers=HEADERS)
        assert deleted.status_code == 200, deleted.text
        assert deleted.json()['invite_code_rotated'] is True
        assert deleted.json()['unassigned_tasks'] == 1
        state = owner.get('/api/bootstrap').json()
        assert [m['id'] for m in state['members']] == [founder['id']]
        assert len(state['bills']) == 1 and state['bills'][0]['title'] == 'Shared bill'
        kept = next(t for t in state['tasks'] if t['id'] == task_id)
        assert kept['assigned_to'] is None and kept['created_by'] == founder['id']
        assert state['user']['is_household_owner'] is True
        assert state['user']['household']['invite_code'] != code

        # Removed account loses its current session and cannot sign in again.
        assert member.get('/api/bootstrap').status_code == 401
        assert member.post('/api/auth/login', json={
            'email': 'wrong-member-test@hic.example', 'password': 'safe-password-123'
        }, headers=HEADERS).status_code == 401
        assert join(fresh, code, 'Old Code', 'old-code-test@hic.example').status_code == 400
        assert owner.request('DELETE', f'/api/household/members/{member_id}', json=CONFIRM, headers=HEADERS).status_code == 404
        assert outsider.get('/api/bootstrap').json()['members'][0]['id'] == outsider_account['id']

        # Deleting the account frees its email for a new registration with a fresh invite.
        new_join = join(fresh, state['user']['household']['invite_code'], 'Returner', 'wrong-member-test@hic.example')
        assert new_join.status_code == 200, new_join.text
        assert new_join.json()['name'] == 'Returner'
        assert member.get('/api/bootstrap').status_code == 401
