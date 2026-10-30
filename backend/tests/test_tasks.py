"""Household chore workflows; uses the same isolated SQLite test database."""
from test_flows import app, HEADER, req, create_household
from fastapi.testclient import TestClient
from backend.app.models import HouseholdTask
from backend.app.db import SessionLocal


def payload(**changes):
    return {
        'title':' Clean the family kitchen ', 'description':'Wipe surfaces and sweep',
        'due_date':'2026-11-02','category':'Cleaning','priority':'high',
        'repeat':'none', 'assigned_to':None, **changes
    }


def test_task_crud_household_sharing_validation_and_isolation():
    with TestClient(app) as owner, TestClient(app) as member, TestClient(app) as outsider:
        founder=create_household(owner,'Task Founder','task-founder@example.com')
        joined=req(member,'/auth/join',{
            'name':'Kitchen Helper','email':'task-helper@example.com',
            'password':'strongpassword123','invite_code':founder['household']['invite_code']
        }).json()
        create_household(outsider,'Other Chores','other-chores@example.com')
        assert owner.get('/api/bootstrap').json()['tasks']==[]
        assert owner.post('/api/tasks',json=payload()).status_code==403
        assert req(owner,'/tasks',payload(title='  ')).status_code==422
        assert req(owner,'/tasks',payload(assigned_to=999999)).status_code==422
        foreign=outsider.get('/api/bootstrap').json()['user']['id']
        assert req(owner,'/tasks',payload(assigned_to=foreign)).status_code==422
        assert req(owner,'/tasks',payload(priority='urgent')).status_code==422
        r=req(owner,'/tasks',payload(assigned_to=joined['id']))
        assert r.status_code==200,r.text
        task=r.json(); ident=task['id']
        assert task['title']=='Clean the family kitchen'
        assert task['assigned_to']==joined['id']
        assert task['status']=='pending'
        assert member.get('/api/bootstrap').json()['tasks'][0]['id']==ident
        assert outsider.get('/api/bootstrap').json()['tasks']==[]
        assert outsider.patch(f'/api/tasks/{ident}/status',json={'status':'completed'},headers=HEADER).status_code==404
        assert outsider.patch(f'/api/tasks/{ident}',json=payload(),headers=HEADER).status_code==404
        assert outsider.delete(f'/api/tasks/{ident}',headers=HEADER).status_code==404
        assert owner.patch(f'/api/tasks/{ident}/status',json={'status':'in_progress'},headers=HEADER).status_code==403
        assert member.patch(f'/api/tasks/{ident}/status',json={'status':'in_progress'},headers=HEADER).status_code==200
        assert member.patch(f'/api/tasks/{ident}',json=payload(title='Kitchen cleaned',priority='low',assigned_to=joined['id']),headers=HEADER).status_code==403
        assert owner.patch(f'/api/tasks/{ident}',json=payload(title='Kitchen cleaned',priority='low',assigned_to=joined['id']),headers=HEADER).status_code==200
        assert owner.get('/api/bootstrap').json()['tasks'][0]['title']=='Kitchen cleaned'
        done=member.patch(f'/api/tasks/{ident}/status',json={'status':'completed'},headers=HEADER)
        assert done.status_code==200 and done.json()['completed_at']
        assert len(owner.get('/api/bootstrap').json()['tasks'])==1
        assert owner.patch(f'/api/tasks/{ident}/status',json={'status':'pending'},headers=HEADER).status_code==403
        assert member.patch(f'/api/tasks/{ident}/status',json={'status':'pending'},headers=HEADER).status_code==200
        assert owner.get('/api/bootstrap').json()['tasks'][0]['completed_at'] is None
        assert member.delete(f'/api/tasks/{ident}',headers=HEADER).status_code==403
        assert owner.delete(f'/api/tasks/{ident}',headers=HEADER).status_code==200
        assert member.get('/api/bootstrap').json()['tasks']==[]


def test_recurring_chore_creates_one_next_occurrence_and_keeps_history():
    with TestClient(app) as c:
        owner=create_household(c,'Recurring Family','task-recurring@example.com')
        r=req(c,'/tasks',payload(title='Take out trash',repeat='weekly',due_date='2026-10-22',assigned_to=owner['id']))
        assert r.status_code==200,r.text
        ident=r.json()['id']
        done=c.patch(f'/api/tasks/{ident}/status',json={'status':'completed'},headers=HEADER)
        assert done.status_code==200,done.text
        entries=c.get('/api/bootstrap').json()['tasks']
        assert len(entries)==2
        old=next(x for x in entries if x['id']==ident)
        new=next(x for x in entries if x['id']!=ident)
        assert old['status']=='completed' and new['status']=='pending'
        assert new['repeat']=='weekly' and new['title']=='Take out trash'
        assert done.json()['next_task']['id'] == new['id']
        assert done.json()['next_task']['assigned_to'] == owner['id']
        assert new['due_date']>='2026-10-29'
        assert c.patch(f'/api/tasks/{ident}/status',json={'status':'completed'},headers=HEADER).status_code==200
        assert len(c.get('/api/bootstrap').json()['tasks'])==2
        assert c.patch(f'/api/tasks/{ident}/status',json={'status':'pending'},headers=HEADER).status_code==409
        assert c.patch(f'/api/tasks/{ident}',json=payload(),headers=HEADER).status_code==409
        assert c.patch(f'/api/tasks/{new["id"]}/status',json={'status':'in_progress'},headers=HEADER).status_code==200


def test_recurring_monthly_clamps_short_months():
    from backend.app.main import next_recurrence_due
    from datetime import date
    actual=next_recurrence_due('2026-01-31','monthly')
    assert date.fromisoformat(actual)>date(2026,1,31)
    assert 1<=date.fromisoformat(actual).day<=31
    assert next_recurrence_due('2026-09-20','weekly') > '2026-09-20'


def test_only_assigned_member_can_change_status_even_if_other_member_created_task():
    with TestClient(app) as founder, TestClient(app) as member:
        owner=create_household(founder,'Household Lead','chore-lead@example.com')
        assistant=req(member,'/auth/join',{
            'name':'Household Member', 'email':'chore-assignee@example.com',
            'password':'strongpassword123','invite_code':owner['household']['invite_code']
        }).json()
        owner_id=owner['id']
        assistant_id=assistant['id']
        assigned=req(founder,'/tasks',payload(title='Assigned chore',assigned_to=assistant_id)).json()
        unassigned=req(founder,'/tasks',payload(title='Unassigned chore')).json()
        other=req(founder,'/tasks',payload(title='Own chore',assigned_to=owner_id)).json()
        for status in ('in_progress','completed','pending'):
            denied=founder.patch(f'/api/tasks/{assigned["id"]}/status',json={'status':status},headers=HEADER)
            assert denied.status_code == 403, denied.text
            denied=member.patch(f'/api/tasks/{other["id"]}/status',json={'status':status},headers=HEADER)
            assert denied.status_code == 403, denied.text
            assert member.patch(f'/api/tasks/{unassigned["id"]}/status',json={'status':status},headers=HEADER).status_code == 403
            assert founder.patch(f'/api/tasks/{unassigned["id"]}/status',json={'status':status},headers=HEADER).status_code == 403
        assert member.patch(f'/api/tasks/{assigned["id"]}/status',json={'status':'in_progress'},headers=HEADER).status_code == 200
        assert member.patch(f'/api/tasks/{assigned["id"]}/status',json={'status':'completed'},headers=HEADER).status_code == 200
        assert member.patch(f'/api/tasks/{assigned["id"]}/status',json={'status':'pending'},headers=HEADER).status_code == 200
        assert founder.patch(f'/api/tasks/{other["id"]}/status',json={'status':'completed'},headers=HEADER).status_code == 200
        assert next(t for t in founder.get('/api/bootstrap').json()['tasks'] if t['id']==unassigned['id'])['status']=='pending'


def test_household_creator_exclusive_task_management_and_member_status():
    with TestClient(app) as founder, TestClient(app) as member, TestClient(app) as outsider:
        owner=create_household(founder,'Task Coordinator','task-coordinator@example.com')
        joined=req(member,'/auth/join',{
            'name':'Task Member','email':'task-member@example.com',
            'password':'strongpassword123','invite_code':owner['household']['invite_code']
        }).json()
        create_household(outsider,'Other Family','other-member-tests@example.com')
        owner_id=owner['id']; member_id=joined['id']
        assert founder.get('/api/bootstrap').json()['user']['is_household_owner'] is True
        assert member.get('/api/bootstrap').json()['user']['is_household_owner'] is False
        for assignee in (None, member_id, owner_id):
            forbidden=req(member,'/tasks',payload(title='Unauthorized new chore',assigned_to=assignee))
            assert forbidden.status_code==403,forbidden.text
        assigned=req(founder,'/tasks',payload(title='Do the dishes',assigned_to=member_id)).json()
        ident=assigned['id']
        before=member.get('/api/bootstrap').json()['tasks'][0]
        assert before['assigned_to']==member_id
        # Members cannot reassign, edit any task details, or delete a task.
        denied=member.patch(f'/api/tasks/{ident}',json=payload(title='Steal task',assigned_to=owner_id),headers=HEADER)
        assert denied.status_code==403,denied.text
        assert member.delete(f'/api/tasks/{ident}',headers=HEADER).status_code==403
        after=member.get('/api/bootstrap').json()['tasks'][0]
        assert after['assigned_to']==member_id and after['title']==before['title']
        # The assignee retains permission to track their own work.
        assert member.patch(f'/api/tasks/{ident}/status',json={'status':'in_progress'},headers=HEADER).status_code==200
        assert member.patch(f'/api/tasks/{ident}/status',json={'status':'completed'},headers=HEADER).status_code==200
        assert founder.patch(f'/api/tasks/{ident}/status',json={'status':'pending'},headers=HEADER).status_code==403
        # Even completed tasks are managed only by the founder.
        assert founder.patch(f'/api/tasks/{ident}',json=payload(title='New chore details',assigned_to=owner_id),headers=HEADER).status_code==200
        assert founder.delete(f'/api/tasks/{ident}',headers=HEADER).status_code==200
        assert outsider.get('/api/bootstrap').json()['tasks']==[]


def test_independent_households_have_independent_creators():
    with TestClient(app) as family_a, TestClient(app) as family_b:
        user_a=create_household(family_a,'Family A','family-a-founder@example.com')
        user_b=create_household(family_b,'Family B','family-b-founder@example.com')
        assert user_a['id'] != user_b['id']
        assert family_a.get('/api/bootstrap').json()['user']['is_household_owner'] is True
        assert family_b.get('/api/bootstrap').json()['user']['is_household_owner'] is True
        task=req(family_b,'/tasks',payload(assigned_to=user_b['id']))
        assert task.status_code == 200
        assert family_a.patch(f'/api/tasks/{task.json()["id"]}',json=payload(assigned_to=user_a['id']),headers=HEADER).status_code==404
