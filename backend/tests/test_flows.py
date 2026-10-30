"""Regression tests for the two lab-critical full workflows and household isolation."""
import os
import tempfile
from pathlib import Path

# Use a separate isolated DB, configured before imports.
_tmp = tempfile.TemporaryDirectory(prefix='hic_tests_')
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(_tmp.name) / 'test.sqlite3')
from fastapi.testclient import TestClient
from backend.app.main import app

HEADER = {'X-HIC-Action': '1'}

def req(client, path, payload):
    return client.post('/api'+path, json=payload, headers=HEADER)

def create_household(client, name, email):
    r = req(client,'/auth/register',{'name':name,'email':email,'password':'strongpassword123','household_name':name+' Home'})
    assert r.status_code == 200, r.text
    return r.json()

def test_reminder_and_bill_flows():
    with TestClient(app) as c:
        owner = create_household(c,'Alex','alex@example.com')
        assert c.get('/api/bootstrap').json()['members'] == [{'id': owner['id'], 'name': 'Alex', 'avatar_id': None, 'photo_version': None}]
        r=req(c,'/reminders',{'title':'Family dentist','event_date':'2026-11-04','event_time':'09:15','category':'Health','description':'Annual appointment'})
        assert r.status_code==200, r.text
        event_id=r.json()['id']
        data=c.get('/api/bootstrap').json()
        assert any(x['id']==event_id for x in data['reminders'])
        assert data['reminders'][0]['title']=='Family dentist'

        b=req(c,'/bills',{'title':'Internet bill','amount':1599,'due_date':'2026-11-10','category':'Internet'})
        assert b.status_code == 200, b.text
        bill_id=b.json()['id']
        r=c.patch(f'/api/bills/{bill_id}/status',json={'status':'paid'},headers=HEADER)
        assert r.status_code==200 and r.json()['status']=='paid', r.text
        data=c.get('/api/bootstrap').json()
        assert data['bills'][0]['status']=='paid'

        r=req(c,'/auth/join',{'name':'Jamie','email':'jamie@example.com','password':'strongpassword123','invite_code':owner['household']['invite_code']})
        assert r.status_code==200, r.text
        members = c.get('/api/bootstrap').json()['members']
        assert [m['name'] for m in members] == ['Alex', 'Jamie']
        assert all(set(m)=={'id','name','avatar_id','photo_version'} for m in members)
        assert c.get('/api/bootstrap').json()['reminders'][0]['id']==event_id
        assert c.get('/api/bootstrap').json()['bills'][0]['status']=='paid'
        pref=c.patch('/api/settings',json={'theme':'dark','text_size':'large'},headers=HEADER)
        assert pref.status_code==200
        assert c.get('/api/bootstrap').json()['preferences']=={'theme':'dark','text_size':'large'}

def test_other_household_cannot_change_records():
    with TestClient(app) as c1, TestClient(app) as c2:
        create_household(c1,'Taylor','taylor@example.com')
        a=req(c1,'/bills',{'title':'Private family bill','amount':850,'due_date':'2026-11-01','category':'Other'}).json()
        create_household(c2,'Morgan','morgan@example.com')
        assert c2.get('/api/bootstrap').json()['bills']==[]
        assert [m['name'] for m in c1.get('/api/bootstrap').json()['members']] == ['Taylor']
        assert [m['name'] for m in c2.get('/api/bootstrap').json()['members']] == ['Morgan']
        r=c2.patch(f'/api/bills/{a["id"]}/status',json={'status':'paid'},headers=HEADER)
        assert r.status_code==404
        assert c1.get('/api/bootstrap').json()['bills'][0]['status']=='unpaid'
        assert c2.post('/api/bills',json={'title':'Invalid','amount':1,'due_date':'2026-11-01'}).status_code ==403

def test_demo_is_explicit_and_removable():
    with TestClient(app) as c:
        create_household(c,'Mila','mila@example.com')
        assert c.get('/api/bootstrap').json()['bills']==[]
        assert req(c,'/demo/seed',{}).status_code==200
        assert all(b['is_demo'] for b in c.get('/api/bootstrap').json()['bills'])
        assert req(c,'/demo/seed',{}).status_code==409
        assert c.delete('/api/demo',headers=HEADER).status_code==200
        assert c.get('/api/bootstrap').json()['bills']==[]


def test_profile_avatar_is_personal_saved_and_limited_to_valid_icons():
    with TestClient(app) as owner, TestClient(app) as family, TestClient(app) as other:
        owner_info = create_household(owner,'Ari','avatar-owner@example.com')
        family_info = req(family,'/auth/join',{
            'name':'Casey','email':'avatar-family@example.com','password':'strongpassword123',
            'invite_code':owner_info['household']['invite_code']
        }).json()
        create_household(other,'Morgan','avatar-other@example.com')
        assert owner.get('/api/bootstrap').json()['user']['avatar_id'] is None
        assert owner.patch('/api/profile/avatar',json={'avatar_id':'../hidden'},headers=HEADER).status_code==422
        assert owner.patch('/api/profile/avatar',json={'avatar_id':'male_01'}).status_code==403
        r=owner.patch('/api/profile/avatar',json={'avatar_id':'female_04'},headers=HEADER)
        assert r.status_code==200 and r.json()['avatar_id']=='female_04'
        data=family.get('/api/bootstrap').json()
        assert data['user']['avatar_id'] is None
        assert next(m for m in data['members'] if m['id']==owner_info['id'])['avatar_id']=='female_04'
        assert next(m for m in data['members'] if m['id']==family_info['id'])['avatar_id'] is None
        assert all(m['id']!=owner_info['id'] for m in other.get('/api/bootstrap').json()['members'])
        assert family.patch('/api/profile/avatar',json={'avatar_id':'male_05'},headers=HEADER).status_code==200
        assert owner.get('/api/bootstrap').json()['user']['avatar_id']=='female_04'
        assert family.get('/api/auth/me').json()['avatar_id']=='male_05'
        assert req(owner,'/auth/logout',{}).status_code==200
        assert owner.get('/api/bootstrap').status_code==401
        login=req(owner,'/auth/login',{'email':'avatar-owner@example.com','password':'strongpassword123'})
        assert login.status_code==200
        assert login.json()['avatar_id']=='female_04'
        assert owner.get('/api/bootstrap').json()['user']['avatar_id']=='female_04'


def test_household_devices_crud_status_persistence_and_isolation():
    with TestClient(app) as owner, TestClient(app) as family, TestClient(app) as outsider:
        owner_info = create_household(owner, 'Device Owner', 'devices-owner@example.com')
        result = req(owner,'/devices',{
            'name':'  Kitchen refrigerator  ', 'room':'  Kitchen ', 'kind':'Refrigerator'
        })
        assert result.status_code == 200, result.text
        device = result.json()
        ident = device['id']
        assert device['name']=='Kitchen refrigerator' and device['room']=='Kitchen'
        assert device['status']=='unknown'  # never guess actual physical power state
        assert device['updated_at']
        assert owner.get('/api/bootstrap').json()['devices'][0]['id']==ident
        assert owner.post('/api/devices',json={'name':'Lamp','room':'Bedroom'}).status_code==403
        assert req(owner,'/devices',{'name':'  ','room':'Kitchen'}).status_code==422
        assert req(owner,'/devices',{'name':'Bad','room':'Kitchen','kind':'not a type'}).status_code==422
        assert owner.patch(f'/api/devices/{ident}/status',json={'status':'bogus'},headers=HEADER).status_code==422

        # Joined family member sees shared records and can edit the same household inventory.
        joined = req(family,'/auth/join',{
            'name':'Family Member','email':'devices-family@example.com',
            'password':'strongpassword123','invite_code':owner_info['household']['invite_code']
        })
        assert joined.status_code==200
        assert family.get('/api/bootstrap').json()['devices'][0]['name']=='Kitchen refrigerator'
        status = family.patch(f'/api/devices/{ident}/status',json={'status':'on'},headers=HEADER)
        assert status.status_code==200 and status.json()['status']=='on'
        assert owner.get('/api/bootstrap').json()['devices'][0]['status']=='on'
        edit = family.patch(f'/api/devices/{ident}',json={
            'name':'Kitchen fridge','room':'Dining area','kind':'Refrigerator','status':'off'
        },headers=HEADER)
        assert edit.status_code==200 and edit.json()['room']=='Dining area'
        assert owner.get('/api/bootstrap').json()['devices'][0]['status']=='off'

        create_household(outsider,'Other Household','devices-other@example.com')
        assert outsider.get('/api/bootstrap').json()['devices']==[]
        assert outsider.patch(f'/api/devices/{ident}/status',json={'status':'on'},headers=HEADER).status_code==404
        assert outsider.patch(f'/api/devices/{ident}',json={
            'name':'Wrong','room':'Other','kind':'Other','status':'on'
        },headers=HEADER).status_code==404
        assert outsider.delete(f'/api/devices/{ident}',headers=HEADER).status_code==404
        assert owner.get('/api/bootstrap').json()['devices'][0]['status']=='off'

        # The owner may remove it, and the deletion is reflected after another bootstrap call.
        assert owner.delete(f'/api/devices/{ident}',headers=HEADER).status_code==200
        assert owner.get('/api/bootstrap').json()['devices']==[]
        assert family.get('/api/bootstrap').json()['devices']==[]
        assert owner.delete(f'/api/devices/{ident}',headers=HEADER).status_code==404


def test_household_sun_location_persists_and_isolated():
    with TestClient(app) as owner, TestClient(app) as family, TestClient(app) as outsider:
        reg = create_household(owner, 'Sun Owner','sun-owner@example.com')
        assert owner.get('/api/bootstrap').json()['sun_location'] is None
        assert owner.patch('/api/household/sun-location',json={'city_id':'butuan'}).status_code == 403
        assert owner.patch('/api/household/sun-location',json={'city_id':'unknown'},headers=HEADER).status_code == 422
        r = owner.patch('/api/household/sun-location',json={'city_id':'butuan'},headers=HEADER)
        assert r.status_code == 200, r.text
        assert r.json() == {'city_id':'butuan','name':'Butuan City','lat':8.9475,'lng':125.5406,'time_zone':'Asia/Manila'}
        assert owner.get('/api/bootstrap').json()['sun_location']['name'] == 'Butuan City'
        join = req(family,'/auth/join',{'name':'Sibling','email':'sun-family@example.com','password':'strongpassword123','invite_code':reg['household']['invite_code']})
        assert join.status_code == 200, join.text
        assert family.get('/api/bootstrap').json()['sun_location']['city_id'] == 'butuan'
        create_household(outsider,'Sun Other', 'sun-other@example.com')
        assert outsider.get('/api/bootstrap').json()['sun_location'] is None
        assert family.patch('/api/household/sun-location',json={'city_id':'cebu'},headers=HEADER).status_code == 200
        assert owner.get('/api/bootstrap').json()['sun_location']['city_id'] == 'cebu'
        assert outsider.get('/api/bootstrap').json()['sun_location'] is None
        assert owner.patch('/api/household/sun-location',json={'city_id':None},headers=HEADER).status_code == 200
        assert family.get('/api/bootstrap').json()['sun_location'] is None
        assert owner.get('/api/bootstrap').json()['devices'] == []


def test_rich_samples_mix_with_real_records_are_repeat_safe_and_removable():
    with TestClient(app) as owner, TestClient(app) as outsider:
        create_household(owner, 'Samples Owner', 'rich-samples@example.com')
        create_household(outsider, 'Samples Other', 'rich-other@example.com')

        # Real records and unique existing energy months must never be overwritten.
        from datetime import datetime, timedelta, timezone
        ph_today = datetime.now(timezone(timedelta(hours=8))).date()
        month = ph_today.strftime('%Y-%m')
        real_bill = req(owner,'/bills',{'title':'Our real family bill','amount':919,
                         'due_date':(ph_today + timedelta(days=9)).isoformat(),
                         'category':'Utilities'})
        assert real_bill.status_code == 200
        real_reminder = req(owner,'/reminders',{'title':'Our actual event',
                              'event_date':(ph_today + timedelta(days=3)).isoformat(),
                              'event_time':'13:00','category':'Family'})
        assert real_reminder.status_code == 200
        real_energy = req(owner,'/energy',{'month':month,'kwh':301.5,'cost':3001.50})
        assert real_energy.status_code == 200, real_energy.text
        before = owner.get('/api/bootstrap').json()
        assert not before['bills'][0]['is_demo']

        # No anonymous or cross-household insertion, and action guard is enforced.
        assert outsider.post('/api/demo/rich').status_code == 403
        result = req(owner,'/demo/rich',{})
        assert result.status_code == 200, result.text
        assert result.json()['total_added'] >= 60
        after = owner.get('/api/bootstrap').json()
        assert any(x['id'] == real_bill.json()['id'] and x['amount'] == 919 and not x['is_demo'] for x in after['bills'])
        assert any(x['id'] == real_reminder.json()['id'] and not x['is_demo'] for x in after['reminders'])
        assert any(x['month'] == month and x['kwh'] == 301.5 and not x['is_demo'] for x in after['energy'])
        for key in ('reminders','announcements','contacts','energy','bills'):
            assert any(x['is_demo'] for x in after[key]), key
        assert outsider.get('/api/bootstrap').json()['reminders'] == []
        assert outsider.get('/api/bootstrap').json()['bills'] == []

        # Same pack cannot duplicate its content, including when the page reloads.
        repeated = req(owner,'/demo/rich',{})
        assert repeated.status_code == 200
        assert repeated.json()['total_added'] == 0

        # Original small-set seed remains blocked for nonempty households.
        assert req(owner,'/demo/seed',{}).status_code == 409

        # Removing labeled examples must leave actual records and amounts alone.
        assert owner.delete('/api/demo',headers=HEADER).status_code == 200
        clean = owner.get('/api/bootstrap').json()
        assert not any(row['is_demo'] for key in ('reminders','announcements','contacts','energy','bills') for row in clean[key])
        assert len(clean['bills']) == 1 and clean['bills'][0]['title'] == 'Our real family bill'
        assert len(clean['reminders']) == 1 and clean['reminders'][0]['title'] == 'Our actual event'
        assert len(clean['energy']) == 1 and clean['energy'][0]['kwh'] == 301.5


def test_rich_samples_also_merge_with_original_small_demo_set():
    with TestClient(app) as client:
        create_household(client, 'Sample Starter', 'rich-starter@example.com')
        assert req(client,'/demo/seed',{}).status_code == 200
        original = client.get('/api/bootstrap').json()
        initial_count = sum(len(original[x]) for x in ('reminders','bills','contacts','announcements','energy'))
        added = req(client,'/demo/rich',{})
        assert added.status_code == 200, added.text
        newer = client.get('/api/bootstrap').json()
        new_count = sum(len(newer[x]) for x in ('reminders','bills','contacts','announcements','energy'))
        assert new_count == initial_count + added.json()['total_added']
        assert req(client,'/demo/rich',{}).json()['total_added'] == 0


def test_continuous_preferences_persist_and_validate():
    """Continuous preferences fit the existing two text columns, no DB migration."""
    with TestClient(app) as first, TestClient(app) as second:
        create_household(first, 'Smooth', 'smooth@example.com')
        change = first.patch('/api/settings', json={
            'theme':'mix:47','text_size':'size:16.3'}, headers=HEADER)
        assert change.status_code == 200, change.text
        assert first.get('/api/bootstrap').json()['preferences'] == {
            'theme':'mix:47','text_size':'size:16.3'}
        # Other household members should retain their own preferences.
        create_household(second, 'Other', 'smooth-other@example.com')
        assert second.get('/api/bootstrap').json()['preferences'] == {
            'theme':'light','text_size':'normal'}
        assert first.patch('/api/settings',json={
            'theme':'mix:101','text_size':'size:16.3'},headers=HEADER).status_code == 422
        assert first.patch('/api/settings',json={
            'theme':'mix:47','text_size':'size:99.9'},headers=HEADER).status_code == 422
        assert first.get('/api/bootstrap').json()['preferences']['theme'] == 'mix:47'
        end = first.patch('/api/settings',json={
            'theme':'dark','text_size':'extra'},headers=HEADER)
        assert end.status_code == 200


def test_haven_luxe_theme_is_valid_and_saved_individually():
    """Dedicated Luxe theme uses existing theme VARCHAR(10), no migration."""
    with TestClient(app) as first, TestClient(app) as second:
        create_household(first, 'Luxe Home', 'luxe-home@example.com')
        create_household(second, 'Separate Home', 'luxe-separate@example.com')
        result=first.patch('/api/settings',json={'theme':'luxe','text_size':'size:16.4'},headers=HEADER)
        assert result.status_code==200, result.text
        assert result.json()=={'theme':'luxe','text_size':'size:16.4'}
        assert first.get('/api/bootstrap').json()['preferences']['theme']=='luxe'
        assert second.get('/api/bootstrap').json()['preferences']['theme']=='light'
        old=first.patch('/api/settings',json={'theme':'mix:37','text_size':'size:16.4'},headers=HEADER)
        assert old.status_code==200
        restored=first.patch('/api/settings',json={'theme':'luxe','text_size':'size:16.4'},headers=HEADER)
        assert restored.status_code==200
        assert first.get('/api/bootstrap').json()['preferences']['theme']=='luxe'


# New custom-photo workflow: JPEG/PNG uploads, self-only updates, and private
# household-scoped image reads. Tests run on isolated SQLite, never Supabase.
def test_custom_photo_crop_storage_privacy_and_avatar_switch():
    from io import BytesIO
    from PIL import Image
    def make_image(color='red',size=(940,510),format='PNG'):
        image=Image.new('RGB', size, color)
        out=BytesIO();image.save(out,format=format)
        return out.getvalue()
    with TestClient(app) as owner, TestClient(app) as family, TestClient(app) as outside:
        account=create_household(owner,'Photo Owner','photo-owner@example.com')
        create_household(outside,'Outside Family','photo-outside@example.com')
        assert owner.put('/api/profile/photo',files={'photo':('x.png',make_image(),'image/png')}).status_code==403
        response=owner.put('/api/profile/photo',headers=HEADER,files={'photo':('x.png',make_image(),'image/png')})
        assert response.status_code==200, response.text
        assert response.json()['avatar_id']=='custom' and response.json()['photo_version']
        mine=owner.get('/api/auth/me').json()
        assert mine['avatar_id']=='custom' and mine['photo_version']
        assert owner.get('/api/bootstrap').json()['members'][0]['photo_version'] == mine['photo_version']
        photo=owner.get(f"/api/profile/photo/{account['id']}")
        assert photo.status_code==200
        assert photo.headers['content-type']=='image/jpeg'
        assert photo.headers['cache-control']=='private, no-store'
        result=Image.open(BytesIO(photo.content))
        assert result.size==(512,512) and result.format=='JPEG'
        assert len(photo.content)<500_000
        assert outside.get(f"/api/profile/photo/{account['id']}").status_code==404
        join=req(family,'/auth/join',{
            'name':'Photo Member','email':'photo-member@example.com','password':'strongpassword123',
            'invite_code':account['household']['invite_code']
        });assert join.status_code==200
        assert family.get(f"/api/profile/photo/{account['id']}").status_code==200
        # A joined household member can see, but cannot modify, another account's photo.
        assert family.get('/api/auth/me').json()['avatar_id'] is None
        assert family.delete('/api/profile/photo',headers=HEADER).status_code==200
        assert owner.get(f"/api/profile/photo/{account['id']}").status_code==200
        # Reject non-image masquerading as image; uploaded bytes never persist.
        assert owner.put('/api/profile/photo',headers=HEADER,files={'photo':('a.jpg',b'<svg/>' ,'image/jpeg')}).status_code==422
        assert owner.put('/api/profile/photo',headers=HEADER,files={'photo':('a.gif',b'GIF89a','image/gif')}).status_code==415
        assert owner.put('/api/profile/photo',headers=HEADER,files={'photo':('huge.jpg',b'x'*(10*1024*1024+1),'image/jpeg')}).status_code==413
        assert owner.get(f"/api/profile/photo/{account['id']}").status_code==200
        assert owner.patch('/api/profile/avatar',headers=HEADER,json={'avatar_id':'male_03'}).status_code==200
        assert owner.get(f"/api/profile/photo/{account['id']}").status_code==404
        assert owner.get('/api/auth/me').json()['avatar_id']=='male_03'
        assert owner.get('/api/auth/me').json()['photo_version'] is None
        # Upload again, sign out/in, then remove only the owner's photo.
        assert owner.put('/api/profile/photo',headers=HEADER,files={'photo':('x.jpg',make_image(format='JPEG'),'image/jpeg')}).status_code==200
        assert req(owner,'/auth/logout',{}).status_code==200
        assert req(owner,'/auth/login',{'email':'photo-owner@example.com','password':'strongpassword123'}).status_code==200
        assert owner.get('/api/auth/me').json()['avatar_id']=='custom'
        assert owner.delete('/api/profile/photo',headers=HEADER).status_code==200
        assert owner.get('/api/auth/me').json()['avatar_id'] is None
        assert owner.get(f"/api/profile/photo/{account['id']}").status_code==404


def test_account_name_edit_owner_permissions_and_persistence():
    with TestClient(app) as owner, TestClient(app) as member, TestClient(app) as other:
        created = create_household(owner, 'Owner Original', 'name-owner@example.com')
        house_id = created['household']['id']
        invite_code = created['household']['invite_code']
        assert created['is_household_owner'] is True
        joined = req(member, '/auth/join', {
            'name': 'Member Original', 'email': 'name-member@example.com',
            'password': 'strongpassword123', 'invite_code': invite_code
        })
        assert joined.status_code == 200, joined.text
        assert joined.json()['is_household_owner'] is False
        outsider = create_household(other, 'Outside Original', 'name-outside@example.com')
        # A missing action header cannot mutate a profile.
        assert member.patch('/api/profile/name', json={'name': 'Changed'}).status_code == 403
        assert member.patch('/api/household/name', json={'name': 'Changed'}, headers=HEADER).status_code == 403
        # Invalid and whitespace-only names are rejected even when initiated directly via API.
        for value in (' ', '  A  ', '     ', 'A' * 101):
            assert owner.patch('/api/profile/name', json={'name': value}, headers=HEADER).status_code == 422
            assert owner.patch('/api/household/name', json={'name': value}, headers=HEADER).status_code == 422
        renamed = member.patch('/api/profile/name', json={'name': '  Jamie   Marie  '}, headers=HEADER)
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()['name'] == 'Jamie Marie'
        assert owner.get('/api/bootstrap').json()['user']['name'] == 'Owner Original'
        assert [x['name'] for x in owner.get('/api/bootstrap').json()['members']] == ['Owner Original', 'Jamie Marie']
        changed = owner.patch('/api/household/name', json={'name': '  The   Green   Household '}, headers=HEADER)
        assert changed.status_code == 200, changed.text
        assert changed.json()['household'] == {'id':house_id,'name':'The Green Household','invite_code':invite_code}
        assert member.get('/api/bootstrap').json()['user']['household']['name'] == 'The Green Household'
        assert outsider['household']['name'] == other.get('/api/bootstrap').json()['user']['household']['name']
        assert member.get('/api/auth/me').json()['name'] == 'Jamie Marie'
        assert member.get('/api/auth/me').json()['email'] == 'name-member@example.com'
        assert owner.get('/api/auth/me').json()['is_household_owner'] is True
        # Owner's name can be edited, and owner authority stays attached to account ID.
        assert owner.patch('/api/profile/name', json={'name': 'Founding Member'}, headers=HEADER).status_code == 200
        assert owner.get('/api/auth/me').json()['is_household_owner'] is True
        assert req(owner, '/auth/logout', {}).status_code == 200
        logged = req(owner, '/auth/login', {'email':'name-owner@example.com','password':'strongpassword123'})
        assert logged.status_code == 200 and logged.json()['name'] == 'Founding Member'
        assert logged.json()['household']['name'] == 'The Green Household'
        assert logged.json()['is_household_owner'] is True
