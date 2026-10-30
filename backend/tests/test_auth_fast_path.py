"""Single-request auth bootstrap; uses the isolated DB from test_flows.

Legacy auth responses must remain compatible. The new ?full=1 response lets
React enter the app without requesting /bootstrap a second time.
"""
from test_flows import app, HEADER, req, create_household
from fastapi.testclient import TestClient

EXPECTED_KEYS = {'user','members','reminders','announcements','contacts','energy',
                 'bills','devices','tasks','sun_location','preferences'}


def assert_full_snapshot(result):
    assert result.status_code == 200, result.text
    snapshot = result.json()
    assert EXPECTED_KEYS <= snapshot.keys()
    assert snapshot['user']['id']
    assert snapshot['members']
    assert isinstance(snapshot['bills'], list)
    assert isinstance(snapshot['tasks'], list)
    return snapshot


def test_register_returns_ready_dashboard_without_second_request():
    with TestClient(app) as client:
        result = client.post('/api/auth/register?full=1', headers=HEADER, json={
            'name': 'Quick Owner', 'email': 'fast-register@example.com',
            'password':'strongpassword123', 'household_name':'Quick Family',
        })
        snapshot = assert_full_snapshot(result)
        assert snapshot['user']['name'] == 'Quick Owner'
        assert snapshot['user']['household']['name'] == 'Quick Family'
        assert snapshot['user']['is_household_owner'] is True
        assert len(snapshot['members']) == 1
        assert snapshot['preferences'] == {'theme':'light','text_size':'normal'}
        assert client.get('/api/bootstrap').json() == snapshot
        # Existing callers without full=1 keep their original response shape.
        assert client.post('/api/auth/logout', headers=HEADER).status_code == 200
        old_response = req(client, '/auth/login', {
            'email':'fast-register@example.com', 'password':'strongpassword123'
        })
        assert old_response.status_code == 200
        assert old_response.json()['name'] == 'Quick Owner'
        assert 'members' not in old_response.json()


def test_login_returns_existing_household_data_and_owner_permissions():
    with TestClient(app) as owner:
        created = create_household(owner, 'Existing Owner', 'fast-owner@example.com')
        bill = req(owner, '/bills', {
            'title':'Electricity bill', 'amount':1300,
            'due_date':'2026-11-12', 'category':'Utilities'
        })
        assert bill.status_code == 200, bill.text
        assert req(owner,'/auth/logout',{}).status_code == 200
        wrong = req(owner,'/auth/login?full=1', {
            'email':'fast-owner@example.com', 'password':'incorrect-password'
        })
        assert wrong.status_code == 401
        assert owner.get('/api/bootstrap').status_code == 401
        result = req(owner,'/auth/login?full=1', {
            'email':'fast-owner@example.com', 'password':'strongpassword123'
        })
        snapshot = assert_full_snapshot(result)
        assert snapshot['user']['id'] == created['id']
        assert snapshot['user']['is_household_owner'] is True
        assert [b['title'] for b in snapshot['bills']] == ['Electricity bill']
        assert owner.get('/api/bootstrap').json() == snapshot


def test_join_returns_current_family_data_without_becoming_owner():
    with TestClient(app) as owner, TestClient(app) as member:
        created = create_household(owner, 'Family Founder', 'fast-founder@example.com')
        result = req(member,'/auth/join?full=1',{
            'name':'Family Member', 'email':'fast-member@example.com',
            'password':'strongpassword123',
            'invite_code':created['household']['invite_code']
        })
        snapshot = assert_full_snapshot(result)
        assert snapshot['user']['is_household_owner'] is False
        assert snapshot['user']['household']['id'] == created['household']['id']
        assert [m['name'] for m in snapshot['members']] == ['Family Founder', 'Family Member']
        assert snapshot == member.get('/api/bootstrap').json()
        assert req(member,'/auth/logout',{}).status_code == 200
        relog = req(member,'/auth/login?full=1',{
            'email':'fast-member@example.com','password':'strongpassword123'
        })
        assert assert_full_snapshot(relog)['user']['is_household_owner'] is False
