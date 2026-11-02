"""Regression: Start never marks complete; complete requires in-progress status."""
from fastapi.testclient import TestClient
from test_flows import app, HEADER, create_household, req
from test_tasks import payload


def test_chore_requires_two_actions_and_keeps_status_consistent():
    with TestClient(app) as client:
        user = create_household(client, 'Chore Lifecycle', 'chore-lifecycle@example.com')
        item = req(client, '/tasks', payload(assigned_to=user['id'], repeat='none')).json()
        endpoint = f'/api/tasks/{item["id"]}/status'
        assert item['status'] == 'pending'
        blocked = client.patch(endpoint, json={'status':'completed'}, headers=HEADER)
        assert blocked.status_code == 409
        assert client.get('/api/bootstrap').json()['tasks'][0]['status'] == 'pending'

        started = client.patch(endpoint, json={'status':'in_progress'}, headers=HEADER)
        assert started.status_code == 200
        assert started.json()['status'] == 'in_progress'
        assert started.json()['completed_at'] is None
        assert client.get('/api/bootstrap').json()['tasks'][0]['status'] == 'in_progress'
        # Repeated Start must not silently complete the chore.
        assert client.patch(endpoint, json={'status':'in_progress'}, headers=HEADER).json()['status']=='in_progress'
        invalid = client.patch(endpoint, json={'status':'pending'}, headers=HEADER)
        assert invalid.status_code == 409

        done = client.patch(endpoint, json={'status':'completed'}, headers=HEADER)
        assert done.status_code == 200
        assert done.json()['status'] == 'completed'
        assert done.json()['completed_at'] is not None
        assert client.get('/api/bootstrap').json()['tasks'][0]['status'] == 'completed'
        assert client.patch(endpoint, json={'status':'completed'}, headers=HEADER).json()['status']=='completed'
        reopened = client.patch(endpoint, json={'status':'pending'}, headers=HEADER)
        assert reopened.status_code == 200
        assert reopened.json()['completed_at'] is None
        assert client.get('/api/bootstrap').json()['tasks'][0]['status'] == 'pending'


def test_recurring_chore_creates_next_only_after_explicit_complete():
    with TestClient(app) as client:
        user=create_household(client,'Recurring Chore Lifecycle','recurring-lifecycle@example.com')
        item=req(client,'/tasks',payload(title='Wash dishes',assigned_to=user['id'],repeat='daily')).json()
        endpoint=f'/api/tasks/{item["id"]}/status'
        assert client.patch(endpoint,json={'status':'completed'},headers=HEADER).status_code == 409
        assert len(client.get('/api/bootstrap').json()['tasks']) == 1
        assert client.patch(endpoint,json={'status':'in_progress'},headers=HEADER).json()['status']=='in_progress'
        assert len(client.get('/api/bootstrap').json()['tasks']) == 1
        done=client.patch(endpoint,json={'status':'completed'},headers=HEADER)
        assert done.json()['status']=='completed'
        assert done.json()['next_task']['status']=='pending'
        assert len(client.get('/api/bootstrap').json()['tasks']) == 2
        assert client.patch(endpoint,json={'status':'completed'},headers=HEADER).status_code == 200
        assert len(client.get('/api/bootstrap').json()['tasks']) == 2
