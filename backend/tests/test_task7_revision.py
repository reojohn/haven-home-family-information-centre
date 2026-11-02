"""Task 7: edits are household-scoped, validated, and retain payment state."""
import os
import tempfile
from pathlib import Path

_tmp = tempfile.TemporaryDirectory(prefix='hic_task7_')
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(_tmp.name) / 'test.sqlite3')
from fastapi.testclient import TestClient
from backend.app.main import app

ACTION={'X-HIC-Action':'1'}

def register(client,name,email):
    response=client.post('/api/auth/register',headers=ACTION,json={
        'name':name,'email':email,'password':'task7securepass','household_name':name+' Home'
    })
    assert response.status_code==200, response.text
    return response.json()

def post(client,route,payload):
    response=client.post(route,json=payload,headers=ACTION)
    assert response.status_code==200,response.text
    return response.json()

def test_edit_saved_bill_preserves_payment_state():
    with TestClient(app) as client:
        register(client,'BillOwner','task7-bill@example.com')
        bill=post(client,'/api/bills',{'title':'Old bill','amount':125,'due_date':'2026-11-02','category':'Utilities','notes':'Before'})
        mark=client.patch(f'/api/bills/{bill["id"]}/status',headers=ACTION,json={'status':'paid'})
        assert mark.status_code==200
        response=client.patch(f'/api/bills/{bill["id"]}',headers=ACTION,json={
            'title':'Updated bill','amount':999.25,'due_date':'2026-11-15','category':'Internet','notes':'After'
        })
        assert response.status_code==200,response.text
        updated=response.json()
        assert updated['title']=='Updated bill'
        assert updated['amount']==999.25
        assert updated['due_date']=='2026-11-15'
        assert updated['status']=='paid'
        assert client.get('/api/bootstrap').json()['bills'][0]['status']=='paid'
        assert client.patch(f'/api/bills/{bill["id"]}',headers=ACTION,json={
            'title':'Oops','amount':-1,'due_date':'2026-11-15','category':'Internet'
        }).status_code==422
        assert client.get('/api/bootstrap').json()['bills'][0]['amount']==999.25

def test_edit_contact_announcement_and_validate_phone():
    with TestClient(app) as client:
        register(client,'HomeOwner','task7-home@example.com')
        announcement=post(client,'/api/announcements',{'title':'Before','content':'Old announcement'})
        contact=post(client,'/api/contacts',{'name':'Mom','relation':'Family','phone':'0917 123 4567'})
        update=client.patch(f'/api/announcements/{announcement["id"]}',headers=ACTION,json={'title':'After','content':'New announcement'})
        assert update.status_code==200 and update.json()['title']=='After'
        invalid=client.patch(f'/api/contacts/{contact["id"]}',headers=ACTION,json={'name':'Mom','relation':'Family','phone':'0000000000'})
        assert invalid.status_code==422
        updated=client.patch(f'/api/contacts/{contact["id"]}',headers=ACTION,json={'name':'Guardian','relation':'Emergency','phone':'+63 917 123 4567'})
        assert updated.status_code==200 and updated.json()['relation']=='Emergency'
        data=client.get('/api/bootstrap').json()
        assert data['contacts'][0]['name']=='Guardian'
        assert data['announcements'][0]['title']=='After'

def test_edits_must_be_scoped_to_current_household_and_require_action_header():
    with TestClient(app) as one,TestClient(app) as two:
        register(one,'HouseOne','task7-one@example.com')
        bill=post(one,'/api/bills',{'title':'Private bill','amount':50,'due_date':'2026-11-02'})
        a=post(one,'/api/announcements',{'title':'Private','content':'House one only'})
        c=post(one,'/api/contacts',{'name':'Contact','phone':'0917 123 4567'})
        register(two,'HouseTwo','task7-two@example.com')
        requests=[
            (f'/api/bills/{bill["id"]}',{'title':'Stolen','amount':12,'due_date':'2026-11-02'}),
            (f'/api/announcements/{a["id"]}',{'title':'Stolen','content':'Not allowed'}),
            (f'/api/contacts/{c["id"]}',{'name':'Stolen','phone':'0917 123 4567'}),
        ]
        for route,payload in requests:
            assert two.patch(route,headers=ACTION,json=payload).status_code==404
            assert one.patch(route,json=payload).status_code==403
