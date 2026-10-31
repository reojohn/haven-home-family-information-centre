import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AlertCircle, Check, CheckCheck, ChevronUp, LoaderCircle, MessageCircle, Send, ShieldCheck, Wifi, RefreshCw, Reply, Pencil, Trash2, X, MoreHorizontal, Save, Sparkles} from 'lucide-react';
import './FamilyChat.css';

const REACTIONS=['❤️','😂','👍','😢','😡'];
const TZ='Asia/Manila';
async function chatRequest(path, method='GET', payload) {
  const options={method,credentials:'same-origin',headers:{}};
  if(method!=='GET')options.headers['X-HIC-Action']='1';
  if(payload!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(payload);}
  const response=await fetch(`/api${path}`,options);
  if(!response.ok){
    const data=await response.json().catch(()=>({}));
    throw Error(response.status===401?'Please sign in again to use Family Chat.':
      response.status===403?'You do not have permission to do that.':
      typeof data.detail==='string'?data.detail:'Could not connect to Family Chat. Please try again.');
  }
  return response.json();
}
function mergeMessages(previous,incoming) {
  if(!incoming?.length)return previous;
  const byId=new Map(previous.map(m=>[String(m.id),m]));
  for(const message of incoming){
    for(const [key,local] of byId){
      if(String(local.id).startsWith('pending-')&&local.client_nonce&&message.client_nonce===local.client_nonce)byId.delete(key);
    }
    byId.set(String(message.id),message);
  }
  return [...byId.values()].sort((a,b)=>(Number(a.id)||Number.MAX_SAFE_INTEGER)-(Number(b.id)||Number.MAX_SAFE_INTEGER));
}
/** Locally preview a reaction without affecting reactions made by other members. */
function withOwnReaction(reactions,userId,emoji) {
  const rest=(reactions||[]).filter(reaction=>String(reaction.user_id)!==String(userId));
  return emoji?[...rest,{user_id:userId,emoji}]:rest;
}
function dayKey(iso){return iso?new Date(iso).toLocaleDateString('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}):'';}
function formatClock(iso){if(!iso)return '';const date=new Date(iso);return Number.isNaN(date.valueOf())?'':date.toLocaleTimeString('en-PH',{timeZone:TZ,hour:'numeric',minute:'2-digit'});}
function dayHeading(iso){
  const key=dayKey(iso),today=dayKey(new Date().toISOString()),yesterday=dayKey(new Date(Date.now()-86400000).toISOString());
  if(key===today)return 'Today';
  if(key===yesterday)return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-PH',{timeZone:TZ,day:'numeric',month:'long',year:'numeric'});
}

/** Private household group chat: all writes go through FastAPI session authorization. */
export default function FamilyChat({user,members,renderAvatar,request=chatRequest,onUnreadChange}) {
  const [messages,setMessages]=useState([]);
  const [draft,setDraft]=useState('');
  const [loading,setLoading]=useState(true);
  const [older,setOlder]=useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [error,setError]=useState('');
  const [connected,setConnected]=useState(false);
  const [typing,setTyping]=useState([]);
  const [receipts,setReceipts]=useState({});
  const [onlineIds,setOnlineIds]=useState([]);
  const [replyTo,setReplyTo]=useState(null);
  const [editing,setEditing]=useState(null);
  const [actionFor,setActionFor]=useState(null);
  const [busyId,setBusyId]=useState(null);
  const [isSending,setIsSending]=useState(false);
  const [unsendTarget,setUnsendTarget]=useState(null);
  const [initialized,setInitialized]=useState(false);
  const wsRef=useRef(null),maxId=useRef(0),eventCursor=useRef(0),bottomRef=useRef(null),scrollRef=useRef(null);
  const typingTimer=useRef(null),sending=useRef(false),skipAutoScroll=useRef(false),lastTyping=useRef(0),touchTimer=useRef(null),inputRef=useRef(null);
  // Each message maintains an independent intent queue so quick taps remain responsive.
  const optimisticReactions=useRef(new Map());
  const unsendCancelRef=useRef(null);
  const callback=useRef(onUnreadChange);
  callback.current=onUnreadChange;
  const memberById=useMemo(()=>new Map(members.map((m,i)=>[m.id,{member:m,index:i}])),[members]);

  const updateMessages=useCallback(items=>{
    if(!items?.length)return;
    for(const item of items)if(typeof item.id==='number')maxId.current=Math.max(maxId.current,item.id);
    setMessages(previous=>mergeMessages(previous,items.map(item=>{
      const pending=optimisticReactions.current.get(String(item.id));
      return pending?{...item,reactions:withOwnReaction(item.reactions,user.id,pending.emoji)}:item;
    })));
  },[user.id]);
  const absorbState=useCallback(data=>{
    if(data?.receipts)setReceipts(data.receipts);
    if(data?.online_ids)setOnlineIds(data.online_ids);
    if(typeof data?.event_cursor==='number')eventCursor.current=Math.max(eventCursor.current,data.event_cursor);
  },[]);
  const markRead=useCallback(async id=>{
    if(!id||document.visibilityState==='hidden')return;
    try{const data=await request('/chat/read','POST',{through_id:id});callback.current?.(data.unread_count);}
    catch{/* Retry the next time messages are shown. */}
  },[request]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const data=await request('/chat/messages');
      updateMessages(data.messages);setHasMore(data.has_more);absorbState(data);
      if(data.messages.length)void markRead(data.messages.at(-1).id);
    }catch(e){setError(e.message||'Unable to load your family messages.');}
    finally{setLoading(false);setInitialized(true);}
  },[request,updateMessages,markRead,absorbState]);
  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    if(!initialized)return;
    let cancelled=false,socket=null,reconnectTimer=null;
    const sync=async()=>{
      if(cancelled||document.visibilityState==='hidden')return;
      try{
        const data=await request(`/chat/sync?after=${maxId.current}&events_after=${eventCursor.current}`);
        if(cancelled)return;
        updateMessages(data.messages);updateMessages(data.changes);absorbState(data);
        const newest=data.messages.at(-1)?.id;
        if(newest)void markRead(newest);
        else if(data.unread_count)void markRead(maxId.current);
      }catch{/* Poll again while network is unavailable. */}
    };
    const join=()=>request('/chat/presence','POST').catch(()=>{});
    void join();
    const heartbeat=window.setInterval(()=>{if(document.visibilityState==='visible')void join();},20000);
    const polling=window.setInterval(()=>{void sync();},3500);
    const connect=()=>{
      if(cancelled)return;
      const url=`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/chat/live?after=${maxId.current}&events_after=${eventCursor.current}`;
      try{
        const ws=new WebSocket(url);socket=ws;wsRef.current=ws;
        ws.onopen=()=>{if(!cancelled){setConnected(true);void sync();}};
        ws.onmessage=event=>{
          if(cancelled)return;
          try{
            const data=JSON.parse(event.data);
            if(data.type==='messages'||data.type==='changes'){
              updateMessages(data.messages);
              if(data.type==='messages'&&data.messages.length)void markRead(data.messages.at(-1).id);
            }
            if(data.type==='state')absorbState(data);
            if(data.type==='typing'&&data.user_id!==user.id){
              setTyping(previous=>{
                const next=previous.filter(item=>item.id!==data.user_id);
                return data.active?[...next,{id:data.user_id,name:data.name,until:Date.now()+3200}]:next;
              });
            }
          }catch{/* Ignore unexpected transport packets. */}
        };
        ws.onclose=()=>{if(cancelled)return;setConnected(false);reconnectTimer=window.setTimeout(connect,15000);};
        ws.onerror=()=>ws.close();
      }catch{reconnectTimer=window.setTimeout(connect,15000);}
    };
    connect();
    const visible=()=>{if(document.visibilityState==='visible'){void join();void sync();}};
    document.addEventListener('visibilitychange',visible);
    const typingCleanup=window.setInterval(()=>setTyping(previous=>previous.filter(item=>item.until>Date.now())),1200);
    return()=>{
      cancelled=true;clearInterval(polling);clearInterval(heartbeat);clearInterval(typingCleanup);
      if(reconnectTimer)clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange',visible);socket?.close();
      if(wsRef.current===socket)wsRef.current=null;
      void request('/chat/presence','DELETE').catch(()=>{});
    };
  },[initialized,user.id,request,updateMessages,absorbState,markRead]);
  useEffect(()=>{
    if(loading)return;
    if(skipAutoScroll.current){skipAutoScroll.current=false;return;}
    bottomRef.current?.scrollIntoView({behavior:'auto',block:'end'});
  },[loading,messages.length]);
  useEffect(()=>()=>{clearTimeout(typingTimer.current);clearTimeout(touchTimer.current);},[]);
  const fetchOlder=async()=>{
    const oldest=messages.find(m=>typeof m.id==='number')?.id;
    if(!oldest||older)return;
    const box=scrollRef.current,height=box?.scrollHeight||0;
    setOlder(true);
    try{
      const data=await request(`/chat/messages?before=${oldest}`);
      skipAutoScroll.current=true;updateMessages(data.messages);setHasMore(data.has_more);
      requestAnimationFrame(()=>{if(box)box.scrollTop=box.scrollHeight-height+box.scrollTop;});
    }catch(e){setError(e.message);}finally{setOlder(false);}
  };
  const emitTyping=active=>{
    const socket=wsRef.current;
    if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'typing',active}));
  };
  const changeDraft=value=>{
    setDraft(value);clearTimeout(typingTimer.current);
    if(value.trim()&&Date.now()-lastTyping.current>1100){emitTyping(true);lastTyping.current=Date.now();}
    typingTimer.current=setTimeout(()=>emitTyping(false),2000);
  };
  const submit=async(previousMessage=null)=>{
    const text=(previousMessage?.body??draft).trim();
    if(!text||text.length>2000||sending.current)return;
    sending.current=true;setIsSending(true);
    const nonce=previousMessage?.client_nonce||(crypto.randomUUID?.().replaceAll('-','')||`${Date.now()}${Math.random().toString(36).slice(2)}`);
    const quoted=previousMessage?.reply_to_id??replyTo?.id??null;
    setError('');
    updateMessages([{id:`pending-${nonce}`,sender_id:user.id,sender_name:user.name,body:text,client_nonce:nonce,reply_to_id:quoted,reply:previousMessage?.reply??(replyTo?{id:replyTo.id,sender_name:replyTo.sender_name,body:replyTo.body?.slice(0,140)}:null),created_at:new Date().toISOString(),pending:true,reactions:[]}]);
    if(!previousMessage){setDraft('');setReplyTo(null);}
    emitTyping(false);
    try{
      const saved=await request('/chat/messages','POST',{body:text,client_nonce:nonce,reply_to_id:quoted});
      updateMessages([saved]);void markRead(saved.id);
    }catch(e){
      setMessages(previous=>previous.map(m=>m.client_nonce===nonce?{...m,pending:false,failed:true}:m));
      setError(e.message||'Message not sent. Tap Retry to try again.');
    }finally{sending.current=false;setIsSending(false);}
  };
  // Reactions render immediately and flush sequentially per message. Each fresh tap
  // replaces the desired emoji, even while an earlier HTTP request is in flight.
  const reactTo=(msg,emoji)=>{
    if(msg.pending||msg.failed||msg.deleted||typeof msg.id!=='number')return;
    const key=String(msg.id);
    let entry=optimisticReactions.current.get(key);
    if(!entry){
      const current=msg.reactions?.find(r=>String(r.user_id)===String(user.id))?.emoji||null;
      entry={emoji:current,remote:current,running:false};
      optimisticReactions.current.set(key,entry);
    }
    entry.emoji=entry.emoji===emoji?null:emoji;
    setError('');setActionFor(null);
    setMessages(previous=>previous.map(item=>String(item.id)===key?
      {...item,reactions:withOwnReaction(item.reactions,user.id,entry.emoji)}:item));
    if(!entry.running){
      entry.running=true;
      void (async()=>{
        let latestServer=null;
        try{
          while(entry.remote!==entry.emoji){
            const payloadEmoji=entry.emoji||entry.remote;
            const result=await request(`/chat/messages/${msg.id}/reaction`,'PUT',{emoji:payloadEmoji});
            latestServer=result;
            entry.remote=result.reactions?.find(r=>String(r.user_id)===String(user.id))?.emoji||null;
            updateMessages([result]);
          }
        }catch(e){
          // Restore the last server-confirmed state, including reactions from other users.
          entry.emoji=entry.remote;
          if(latestServer)updateMessages([latestServer]);
          else setMessages(previous=>previous.map(item=>String(item.id)===key?
            {...item,reactions:withOwnReaction(item.reactions,user.id,entry.remote)}:item));
          setError(e.message||'Could not save that reaction. Please try again.');
        }finally{
          optimisticReactions.current.delete(key);
          if(latestServer)updateMessages([latestServer]);
        }
      })();
    }
  };
  const operate=async(msg,action)=>{
    if(busyId||msg.pending||msg.failed)return;
    const newBody=draft.trim();
    if(action==='edit'&&!newBody)return;
    setBusyId(msg.id);setError('');setActionFor(null);
    // Edit / unsend should also feel immediate. Reconcile with the server and
    // restore the prior message if the request cannot be completed.
    const oldSnapshot=msg;
    if(action==='edit'||action==='unsend'){
      setMessages(previous=>previous.map(item=>String(item.id)===String(msg.id)?
        (action==='unsend'?{...item,deleted:true,body:'',reactions:[]}:
          {...item,body:newBody,edited_at:new Date().toISOString()}):item));
    }
    try{
      let result;
      if(action==='edit')result=await request(`/chat/messages/${msg.id}`,'PATCH',{body:newBody});
      if(action==='unsend')result=await request(`/chat/messages/${msg.id}`,'DELETE');
      updateMessages([result]);
      if(action==='edit'){setEditing(null);setDraft('');}
    }catch(e){
      setMessages(previous=>previous.map(item=>String(item.id)===String(msg.id)?oldSnapshot:item));
      setError(e.message||'Could not update the message. Please try again.');
    }finally{setBusyId(null);}
  };
  const startReply=msg=>{setReplyTo(msg);setEditing(null);setActionFor(null);requestAnimationFrame(()=>inputRef.current?.focus());};
  const startEdit=msg=>{setEditing(msg);setReplyTo(null);setDraft(msg.body);setActionFor(null);requestAnimationFrame(()=>inputRef.current?.focus());};
  const cancelCompose=()=>{setEditing(null);setReplyTo(null);setDraft('');};
  const unsend=msg=>{setActionFor(null);setUnsendTarget(msg);};
  const confirmUnsend=()=>{
    if(!unsendTarget)return;
    const target=unsendTarget;
    setUnsendTarget(null);
    void operate(target,'unsend');
  };
  useEffect(()=>{
    if(!unsendTarget)return;
    const previouslyFocused=document.activeElement;
    const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();setUnsendTarget(null);}
      if(event.key==='Tab'){
        const cancel=unsendCancelRef.current;
        const confirm=cancel?.nextElementSibling;
        if(!cancel||!confirm)return;
        if(event.shiftKey&&document.activeElement===cancel){event.preventDefault();confirm.focus();}
        if(!event.shiftKey&&document.activeElement===confirm){event.preventDefault();cancel.focus();}
      }
    };
    document.addEventListener('keydown',keydown);
    unsendCancelRef.current?.focus();
    return ()=>{
      document.removeEventListener('keydown',keydown);
      if(previouslyFocused?.isConnected)previouslyFocused.focus?.();
    };
  },[unsendTarget]);
  const displayName=id=>memberById.get(id)?.member?.name?.split(' ')[0]||'Member';
  const activeNames=onlineIds.filter(id=>id!==user.id).map(displayName);
  return <div className="family-chat" aria-label="Private family group chat">
    <div className="family-chat-heading">
      <span className="family-chat-group-icon"><MessageCircle size={21}/></span>
      <div><strong>Family Group Chat <Sparkles size={13} aria-hidden="true" className="family-chat-heading-sparkle"/></strong><small><ShieldCheck size={12}/> Private to your household · {members.length} members</small>
        <small className="family-chat-presence"><span className="family-chat-online-dot"/>{activeNames.length?`${activeNames.join(', ')} active now`:"You are in the family chat"}</small>
      </div>
      <span className="family-chat-connection" title={connected?'Live connection':'Automatic message syncing'}>{connected?<Wifi size={17}/>:<RefreshCw size={17}/>}</span>
    </div>
    <div className="family-chat-messages" ref={scrollRef} role="log" aria-label="Family messages" aria-live="polite" aria-relevant="additions text">
      {hasMore&&<button className="family-chat-older" type="button" disabled={older} onClick={fetchOlder}><ChevronUp size={16}/>{older?'Loading…':'Load earlier messages'}</button>}
      {loading&&<div className="family-chat-empty"><LoaderCircle className="family-chat-spin" size={26}/> Loading messages…</div>}
      {!loading&&!messages.length&&<div className="family-chat-empty"><MessageCircle size={32}/><strong>Say hello to your family!</strong><span>Your household's private conversation starts here.</span></div>}
      {messages.map((msg,index)=>{
        const mine=msg.sender_id===user.id,author=memberById.get(msg.sender_id),realId=typeof msg.id==='number';
        const quote=msg.reply_to_id?(messages.find(m=>m.id===msg.reply_to_id)||msg.reply):null;
        const seen=mine&&realId?members.filter(m=>m.id!==user.id&&Number(receipts[String(m.id)]||0)>=msg.id):[];
        const selectedReaction=msg.reactions?.find(r=>String(r.user_id)===String(user.id))?.emoji;
        const reactionCounts=REACTIONS.map(emoji=>[emoji,msg.reactions?.filter(r=>r.emoji===emoji).length||0]).filter(item=>item[1]);
        return <div key={msg.id}>
          {msg.created_at&&dayKey(messages[index-1]?.created_at)!==dayKey(msg.created_at)&&<div className="family-chat-day">{dayHeading(msg.created_at)}</div>}
          <div className={`family-chat-line ${mine?'mine':''} ${msg.pending?'is-pending':''} ${busyId===msg.id?'is-updating':''}`}>
            {!mine&&<span className="family-chat-avatar">{author?renderAvatar(author.member,author.index):<span>•</span>}{onlineIds.includes(msg.sender_id)&&<i aria-label="Active now"/>}</span>}
            <div className="family-chat-message-block" onTouchStart={()=>{if(realId&&!msg.deleted)touchTimer.current=setTimeout(()=>setActionFor(msg.id),550);}} onTouchEnd={()=>clearTimeout(touchTimer.current)} onTouchMove={()=>clearTimeout(touchTimer.current)}>
              {!mine&&<span className="family-chat-author">{msg.sender_name}</span>}
              <div className="family-chat-message-content">
                <div className={`family-chat-bubble ${msg.deleted?'family-chat-bubble-deleted':''}`}>
                  {quote&&<div className="family-chat-quote"><strong>{quote.sender_name||'Family member'}</strong><span>{quote.deleted?'Message unsent':quote.body}</span></div>}
                  {msg.deleted?<em>Message unsent</em>:msg.body}
                </div>
                {realId&&!msg.deleted&&<button type="button" className="family-chat-actions-toggle" aria-label={`Actions for message from ${msg.sender_name}`} aria-expanded={actionFor===msg.id} onClick={()=>setActionFor(actionFor===msg.id?null:msg.id)}><MoreHorizontal size={17}/></button>}
              </div>
              {!!reactionCounts.length&&<div className="family-chat-reaction-pills">{reactionCounts.map(([emoji,count])=><button type="button" disabled={!realId||msg.deleted} key={emoji} className={selectedReaction===emoji?'selected':''} onClick={()=>reactTo(msg,emoji)} title={`${count} ${count===1?'reaction':'reactions'}`}>{emoji} {count}</button>)}</div>}
              {actionFor===msg.id&&!msg.deleted&&realId&&<div className="family-chat-action-menu" role="group" aria-label="Message actions">
                <div className="family-chat-reaction-options">{REACTIONS.map(emoji=><button key={emoji} type="button" aria-label={`React ${emoji}`} className={selectedReaction===emoji?'selected':''} onClick={()=>reactTo(msg,emoji)}>{emoji}</button>)}</div>
                <button type="button" onClick={()=>startReply(msg)}><Reply size={14}/> Reply</button>
                {mine&&<button type="button" onClick={()=>startEdit(msg)}><Pencil size={14}/> Edit</button>}
                {mine&&<button type="button" className="family-chat-danger" onClick={()=>unsend(msg)}><Trash2 size={14}/> Unsend</button>}
              </div>}
              <span className="family-chat-meta">{formatClock(msg.created_at)} {msg.edited_at&&!msg.deleted?'· Edited ':''}
                {mine&&(msg.failed?<button type="button" onClick={()=>void submit(msg)}><AlertCircle size={12}/> Retry</button>:msg.pending?<><LoaderCircle className="family-chat-spin family-chat-sending-icon" size={12}/> Sending…</>:<><Check size={12}/> Sent</>)}
              </span>
              {mine&&!!seen.length&&<span className="family-chat-seen" title={seen.map(m=>m.name).join(', ')}><CheckCheck size={12}/> Seen by {seen.length===1?seen[0].name.split(' ')[0]:`${seen.length} members`}</span>}
            </div>
          </div>
        </div>;
      })}
      <div ref={bottomRef}/>
    </div>
    {typing.length>0&&<p className="family-chat-typing">{typing.map(item=>item.name.split(' ')[0]).join(', ')} {typing.length===1?'is':'are'} typing…</p>}
    {error&&<p className="family-chat-error" role="alert"><AlertCircle size={14}/>{error}</p>}
    {(replyTo||editing)&&<div className="family-chat-compose-context"><div><strong>{editing?'Editing your message':`Replying to ${replyTo.sender_name}`}</strong><span>{editing?editing.body:(replyTo.deleted?'Message unsent':replyTo.body)}</span></div><button type="button" onClick={cancelCompose} aria-label="Cancel reply or edit"><X size={17}/></button></div>}
    <form className="family-chat-composer" onSubmit={event=>{event.preventDefault();if(editing)void operate(editing,'edit');else void submit();}}>
      <div className="family-chat-compose-field">
        <textarea ref={inputRef} rows={1} maxLength={2000} value={draft} onChange={event=>changeDraft(event.target.value)}
          onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(editing)void operate(editing,'edit');else void submit();}}}
          placeholder={editing?'Edit your message…':'Message your family…'} aria-label={editing?'Edit family message':'Message your family'}/>
      </div>
      <button type="submit" className={`family-chat-send ${isSending?'is-sending':''}`} disabled={!draft.trim()||!!busyId||isSending} aria-label={editing?'Save message edits':'Send message'} title={editing?'Save edits':'Send message'}>{isSending?<LoaderCircle className="family-chat-spin" size={19}/>:editing?<Save size={18}/>:<Send size={18}/>}</button>
    </form>
    <div className="family-chat-caption">Enter to send <span>·</span> Shift + Enter for a new line</div>
    {unsendTarget&&<div className="family-chat-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setUnsendTarget(null);}}>
      <div className="family-chat-modal" role="alertdialog" aria-modal="true" aria-labelledby="chat-unsend-title" aria-describedby="chat-unsend-desc">
        <div className="family-chat-modal-icon"><Trash2 size={23}/></div>
        <div className="family-chat-modal-eyebrow">FAMILY CHAT</div>
        <h3 id="chat-unsend-title">Unsend this message?</h3>
        <p id="chat-unsend-desc">This message will be removed for everyone in your household. Replies to it will show that it was unsent.</p>
        <div className="family-chat-modal-preview">{unsendTarget.body?.slice(0,140)||'Your message'}</div>
        <div className="family-chat-modal-actions">
          <button ref={unsendCancelRef} type="button" className="family-chat-modal-cancel" onClick={()=>setUnsendTarget(null)}>Keep message</button>
          <button type="button" className="family-chat-modal-confirm" onClick={confirmUnsend}><Trash2 size={15}/> Unsend for everyone</button>
        </div>
      </div>
    </div>}
  </div>;
}
