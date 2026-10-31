"""Authorization and functional regression for Messenger-style family chat."""
from fastapi.testclient import TestClient
from backend.app.main import app

H={'X-HIC-Action':'1'}
def register(c,name,email):
    r=c.post('/api/auth/register',headers=H,json={'name':name,'email':email,'password':'password-very-secure','household_name':name+' home'})
    assert r.status_code==200,r.text
    return r.json()
def join(c,name,email,code):
    r=c.post('/api/auth/join',headers=H,json={'name':name,'email':email,'password':'password-very-secure','invite_code':code})
    assert r.status_code==200,r.text
    return r.json()
def send(c,body,nonce,reply=None):
    return c.post('/api/chat/messages',headers=H,json={'body':body,'client_nonce':nonce,'reply_to_id':reply})


def test_reaction_reply_edit_unsend_and_privacy():
    with TestClient(app) as owner, TestClient(app) as member, TestClient(app) as outsider:
        founder=register(owner,'Parent Messenger','parent-messenger@example.com')
        guest=join(member,'Child Messenger','child-messenger@example.com',founder['household']['invite_code'])
        register(outsider,'Other Household','other-household@example.com')
        first=send(owner,'Original first message','messenger-nonce-first').json()
        ident=first['id']
        assert first['edited_at'] is None and not first['deleted'] and first['reactions']==[]
        assert member.patch(f'/api/chat/messages/{ident}',headers=H,json={'body':'Nope'}).status_code==403
        assert member.delete(f'/api/chat/messages/{ident}',headers=H).status_code==403
        assert outsider.patch(f'/api/chat/messages/{ident}',headers=H,json={'body':'Nope'}).status_code==404
        assert outsider.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'👍'}).status_code==404
        assert send(outsider,'Cross-household reply','messenger-outside',ident).status_code==404
        assert owner.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'🔥'}).status_code==422
        assert owner.put(f'/api/chat/messages/{ident}/reaction',json={'emoji':'👍'}).status_code==403
        reaction=member.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'❤️'})
        assert reaction.status_code==200,reaction.text
        assert reaction.json()['reactions']==[{'user_id':guest['id'],'emoji':'❤️'}]
        assert member.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'😂'}).json()['reactions']==[{'user_id':guest['id'],'emoji':'😂'}]
        assert member.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'😢'}).json()['reactions']==[{'user_id':guest['id'],'emoji':'😢'}]
        assert member.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'😡'}).json()['reactions']==[{'user_id':guest['id'],'emoji':'😡'}]
        assert member.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'😡'}).json()['reactions']==[]
        reply=send(member,'My reply','messenger-nonce-reply',ident)
        assert reply.status_code==201,reply.text
        assert reply.json()['reply']['body']=='Original first message'
        assert owner.patch(f'/api/chat/messages/{ident}',headers=H,json={'body':'Corrected first message'}).json()['edited_at']
        loaded=member.get('/api/chat/messages').json()['messages']
        assert loaded[-1]['reply']['body']=='Corrected first message'
        synced=member.get('/api/chat/sync',params={'after':0,'events_after':0}).json()
        assert synced['changes'] and synced['event_cursor']>0
        assert owner.delete(f'/api/chat/messages/{ident}',headers=H).json()['deleted']
        loaded=member.get('/api/chat/messages').json()['messages']
        assert loaded[0]['body']=='' and loaded[0]['deleted']
        assert loaded[0]['reactions']==[]
        assert loaded[-1]['reply']['body']=='Message unsent'
        assert owner.patch(f'/api/chat/messages/{ident}',headers=H,json={'body':'revive'}).status_code==409
        assert member.put(f'/api/chat/messages/{ident}/reaction',headers=H,json={'emoji':'❤️'}).status_code==409
        assert send(member,'No reply now','messenger-nonce-denied',ident).status_code==400
        assert outsider.get('/api/chat/sync',params={'after':0,'events_after':0}).json()['changes']==[]
        assert outsider.get('/api/chat/messages').json()['messages']==[]


def test_presence_read_receipts_member_removal():
    with TestClient(app) as parent, TestClient(app) as kid, TestClient(app) as stranger:
        founder=register(parent,'Parent Reactions','parent-reactions@example.com')
        guest=join(kid,'Kid Reactions','kid-reactions@example.com',founder['household']['invite_code'])
        register(stranger,'Stranger Presence','stranger-presence@example.com')
        item=send(parent,'How are you','messenger-nonce-read').json()
        assert parent.post('/api/chat/presence',headers=H).status_code==200
        assert kid.post('/api/chat/presence',headers=H).status_code==200
        state=parent.get('/api/chat/sync').json()
        assert founder['id'] in state['online_ids'] and guest['id'] in state['online_ids']
        assert stranger.get('/api/chat/sync').json()['online_ids'] == []
        assert kid.post('/api/chat/read',headers=H,json={'through_id':item['id']}).status_code==200
        state=parent.get('/api/chat/sync').json()
        assert state['receipts'][str(guest['id'])]>=item['id']
        assert kid.put(f'/api/chat/messages/{item["id"]}/reaction',headers=H,json={'emoji':'👍'}).status_code==200
        removed=parent.request('DELETE',f'/api/household/members/{guest["id"]}',headers=H,json={'owner_password':'password-very-secure'})
        assert removed.status_code==200,removed.text
        state=parent.get('/api/chat/sync').json()
        assert guest['id'] not in state['online_ids']
        assert str(guest['id']) not in state['receipts']
        assert state['messages'][0]['reactions']==[]
        assert kid.get('/api/chat/sync').status_code==401
