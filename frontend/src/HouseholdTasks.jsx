import PremiumSelect from './PremiumSelect.jsx';
import React, {useEffect, useMemo, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {
  ListTodo, Plus, Search, UsersRound, CheckCircle2, Clock3, AlertTriangle,
  Circle, Play, Check, CalendarDays, Repeat2, Pencil, Trash2, X, Save,
  Sparkles, ChevronLeft, ChevronRight, ClipboardList,
  UserRound, Info, MoreHorizontal, LockKeyhole, LayoutList, List, RotateCcw
} from 'lucide-react';
import './HouseholdTasks.css';

const CATEGORIES=['Cleaning','Kitchen','Errands','Maintenance','Other'];
const PRIORITIES=[['low','Low'],['normal','Normal'],['high','High']];
const REPEATS=[['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']];
const EMPTY={title:'',description:'',category:'Cleaning',priority:'normal',due_date:'',assigned_to:'',repeat:'none'};
const niceDate = value => value ? new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00`)) : 'No date';
const memberLabel=(members,id)=>members.find(m=>m.id===id)?.name || 'Unassigned';
const statusLabel={pending:'To do',in_progress:'In progress',completed:'Completed'};
const repeatLabel={none:'One-time',daily:'Daily',weekly:'Weekly',monthly:'Monthly'};
const avatarIds=['male_01','female_01','male_02','female_02','male_03','female_03','male_04','female_04','male_05','female_05'];
function MemberAvatar({member}){
  if(!member)return <span className="chore-person-unassigned"><UserRound size={15}/></span>;
  const id=avatarIds.includes(member.avatar_id)?member.avatar_id:avatarIds[(Math.max(1,Number(member.id)||1)-1)%avatarIds.length];
  const src=member.avatar_id==='custom' && member.photo_version
    ? `/api/profile/photo/${member.id}?v=${encodeURIComponent(member.photo_version)}`
    : `/avatars/${id}.png`;
  return <img className="chore-person-avatar" src={src} alt="" loading="lazy"/>;
}
function friendlyDue(value,today){
  if(!value)return 'No due date';
  const diff=Math.round((new Date(`${value}T12:00:00`)-new Date(`${today}T12:00:00`))/86400000);
  if(diff===0)return 'Today';
  if(diff===1)return 'Tomorrow';
  if(diff===-1)return 'Yesterday';
  return niceDate(value);
}
function shortChoreDescription(value){
  // Suppress redundant seed-script boilerplate in the list; original data stays unchanged.
  return String(value||'').replace(/\s*Demonstration record for interface testing\.?\s*\[HAVEN_CHORES_V1\]/gi,'').trim();
}

export default function HouseholdTasks({tasks=[],members=[],currentUserId,isHouseholdOwner=false,today,onRun,onStatusChange}){
  const loc=useLocation();
  const [open,setOpen]=useState(false),[editing,setEditing]=useState(null),[form,setForm]=useState({...EMPTY,due_date:today});
  const [working,setWorking]=useState(false),[activeId,setActiveId]=useState(null),[removeTarget,setRemoveTarget]=useState(null);
  const [focus,setFocus]=useState(()=>new URLSearchParams(loc.search).get('view')==='all'?'all':'mine');
  const [search,setSearch]=useState(''),[status,setStatus]=useState('active'),[priority,setPriority]=useState('all'),[assigned,setAssigned]=useState('all');
  const [sort,setSort]=useState('due'),[page,setPage]=useState(1),[perPage,setPerPage]=useState(10);
  const [density,setDensity]=useState('comfortable'),[menuTaskId,setMenuTaskId]=useState(null);
  useEffect(()=>{
    if(!open && !removeTarget)return;
    const dismiss=event=>{if(event.key==='Escape' && !working){setOpen(false);setEditing(null);setRemoveTarget(null)}};
    document.addEventListener('keydown',dismiss);
    return ()=>document.removeEventListener('keydown',dismiss);
  },[open,removeTarget,working]);
  const pending=tasks.filter(t=>t.status==='pending').length;
  const inProgress=tasks.filter(t=>t.status==='in_progress').length;
  const completed=tasks.filter(t=>t.status==='completed').length;
  const overdue=tasks.filter(t=>t.status!=='completed' && t.due_date<today).length;
  const totalActive=pending+inProgress;
  const percent=tasks.length ? Math.round(completed/tasks.length*100):0;
  const myTasks=useMemo(()=>tasks.filter(t=>Number(t.assigned_to)===Number(currentUserId)),[tasks,currentUserId]);
  const scopedTasks=focus==='mine'?myTasks:tasks;
  const tabCounts={
    active:scopedTasks.filter(t=>t.status!=='completed').length,
    pending:scopedTasks.filter(t=>t.status==='pending').length,
    in_progress:scopedTasks.filter(t=>t.status==='in_progress').length,
    completed:scopedTasks.filter(t=>t.status==='completed').length,
    overdue:scopedTasks.filter(t=>t.status!=='completed'&&t.due_date<today).length,
    all:scopedTasks.length
  };
  const filtered=useMemo(()=>{
    const needle=search.trim().toLocaleLowerCase();
    return scopedTasks.filter(t=>{
      if(status==='active' && t.status==='completed')return false;
      if(status==='overdue' && (t.status==='completed'||t.due_date>=today))return false;
      if(!['all','active','overdue'].includes(status) && t.status!==status)return false;
      if(priority!=='all' && t.priority!==priority)return false;
      if(focus==='all' && assigned!=='all' && (assigned==='unassigned' ? t.assigned_to!=null : Number(t.assigned_to)!==Number(assigned)))return false;
      if(!needle)return true;
      return [t.title,t.description,t.category,t.due_date,memberLabel(members,t.assigned_to)]
        .some(value=>String(value||'').toLocaleLowerCase().includes(needle));
    }).sort((a,b)=>{
      if(sort==='newest')return b.id-a.id;
      if(sort==='priority'){
        const rank={high:0,normal:1,low:2};return (rank[a.priority]-rank[b.priority]) || a.due_date.localeCompare(b.due_date);
      }
      return a.due_date.localeCompare(b.due_date) || a.id-b.id;
    });
  },[scopedTasks,members,search,status,priority,assigned,sort,focus,today]);
  useEffect(()=>setPage(1),[focus,search,status,priority,assigned,sort,perPage]);
  useEffect(()=>setMenuTaskId(null),[focus,search,status,priority,assigned,sort,page]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/perPage));
  const safePage=Math.min(page,pageCount);
  const shown=filtered.slice((safePage-1)*perPage,safePage*perPage);
  const hasExtraFilters=search.trim()!==''||priority!=='all'||(focus==='all'&&assigned!=='all');
  const clearFilters=()=>{setSearch('');setPriority('all');setAssigned('all');setStatus('active')};
  const switchFocus=next=>{setFocus(next);setAssigned('all');setMenuTaskId(null)};
  const close=()=>{if(!working){setOpen(false);setEditing(null)}};
  const showCreate=()=>{if(!isHouseholdOwner)return;setEditing(null);setForm({...EMPTY,due_date:today});setOpen(true)};
  const showEdit=task=>{
    if(!isHouseholdOwner)return;
    setEditing(task.id);
    setForm({title:task.title,description:task.description||'',category:task.category,priority:task.priority,
      due_date:task.due_date,assigned_to:task.assigned_to==null?'':String(task.assigned_to),repeat:task.repeat});
    setOpen(true);
  };
  const save=async event=>{
    event.preventDefault();if(working || !isHouseholdOwner)return;
    const payload={...form,title:form.title.trim(),description:form.description.trim(),assigned_to:form.assigned_to===''?null:Number(form.assigned_to)};
    if(!payload.title)return;
    setWorking(true);
    try{
      await onRun(editing?`/tasks/${editing}`:'/tasks',editing?'PATCH':'POST',payload,
        editing?'Chore updated for your household.':'New chore shared with your household.');
      setOpen(false);setEditing(null);
    }catch{}finally{setWorking(false)}
  };
  const changeStatus=async(task,next)=>{
    if(activeId!==null || task.assigned_to!==currentUserId)return;
    setActiveId(task.id);
    try{await onStatusChange(task,next)}finally{setActiveId(null)}
  };
  const remove=async()=>{
    if(!removeTarget || working || !isHouseholdOwner)return;
    setWorking(true);
    try{await onRun(`/tasks/${removeTarget.id}`,'DELETE',undefined,'Chore removed.');setRemoveTarget(null)}
    catch{}finally{setWorking(false)}
  };
  return <div className="chores-page">
    <div className="page-header"><div><span className="eyebrow">A LITTLE TEAMWORK, EVERY DAY</span><h1>Household Tasks &amp; Chores</h1><p>Share responsibilities, stay on schedule, and celebrate every little win.</p></div>
      <div className="page-actions">{isHouseholdOwner
        ? <button className="btn btn-primary" onClick={showCreate}><Plus size={18}/> Add a task</button>
        : <span className="chore-owner-note"><LockKeyhole size={15}/> Household creator assigns chores</span>}</div></div>
    <section className="chores-intro" aria-label="Household chore progress">
      <div className="chores-intro-copy"><span className="chores-kicker"><Sparkles size={15}/> YOUR HOME, IN HARMONY</span><h2>Little things, done together.</h2>
        <p>One shared place for the chores and responsibilities that keep your household running smoothly.</p>
        <span className="chores-intro-note"><UsersRound size={16}/> Shared with {members.length} household {members.length===1?'member':'members'}</span>
      </div>
      <div className="chores-progress-card"><div className="chores-progress-heading"><span>Overall progress</span><strong>{percent}%</strong></div>
        <div role="progressbar" aria-label="Completed household tasks" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100" className="chores-progress-track"><span style={{width:`${percent}%`}}/></div>
        <small>{completed} completed out of {tasks.length} recorded tasks</small>
      </div>
    </section>
    <section className="chores-stats" aria-label="Task overview">
      {[
        {key:'pending',title:'To do',value:pending,sub:'Tasks to get started',icon:ListTodo},
        {key:'progress',title:'In progress',value:inProgress,sub:'Currently being handled',icon:Clock3},
        {key:'done',title:'Completed',value:completed,sub:'Household wins',icon:CheckCircle2},
        {key:'late',title:'Overdue',value:overdue,sub:'Need attention',icon:AlertTriangle}
      ].map(item=><article key={item.key} className={`chores-stat chores-stat-${item.key}`}>
        <div><span>{item.title}</span><span className="chores-stat-icon"><item.icon size={19}/></span></div>
        <strong>{item.value}</strong><small>{item.sub}</small>
      </article>)}
    </section>
    <section id="family-chore-board" className="chores-workspace panel">
      <div className="chores-workspace-heading"><div><span className="chores-section-eyebrow"><ClipboardList size={16}/> HOUSEHOLD WORKSPACE</span><h2>Family chore board</h2><p>See what matters, who is responsible, and what is due next.</p></div>
        <span className="chores-count">{totalActive} active {totalActive===1?'task':'tasks'}</span></div>
      <div className="chore-scope-bar" aria-label="Choose whose tasks to display">
        <div className="chore-scope-toggle">
          <button type="button" className={focus==='mine'?'selected':''} aria-pressed={focus==='mine'} onClick={()=>switchFocus('mine')}><UserRound size={16}/> My tasks <span>{myTasks.length}</span></button>
          <button type="button" className={focus==='all'?'selected':''} aria-pressed={focus==='all'} onClick={()=>switchFocus('all')}><UsersRound size={16}/> All household <span>{tasks.length}</span></button>
        </div>
        <p>{focus==='mine'?'Your responsibilities, without everyone else’s clutter.':'View all shared responsibilities; only assignees can change progress.'}</p>
      </div>
      <div className="chore-status-tabs" aria-label="Filter chores by progress">
        {[
          ['active','Active'],['pending','To do'],['in_progress','In progress'],['overdue','Overdue'],['completed','Completed'],['all','All']
        ].map(([value,label])=><button type="button" key={value} className={`${status===value?'active':''} chore-tab-${value}`} aria-pressed={status===value} onClick={()=>setStatus(value)}>
          {label}<span>{tabCounts[value]}</span>
        </button>)}
      </div>
      <div className="chore-toolbar">
        <label className="chores-search"><Search size={18}/><input aria-label="Search household chores" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a chore…" maxLength={120}/></label>
        <label className="chore-toolbar-filter"><span>Priority</span><PremiumSelect aria-label="Filter priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="all">All priorities</option>{PRIORITIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</PremiumSelect></label>
        {focus==='all'&&<label className="chore-toolbar-filter"><span>Assigned to</span><PremiumSelect aria-label="Filter assigned member" value={assigned} onChange={e=>setAssigned(e.target.value)}><option value="all">Everyone</option><option value="unassigned">Unassigned</option>{members.map(m=><option key={m.id} value={String(m.id)}>{m.name}</option>)}</PremiumSelect></label>}
        <label className="chore-toolbar-filter"><span>Sort</span><PremiumSelect aria-label="Sort chores" value={sort} onChange={e=>setSort(e.target.value)}><option value="due">Due soonest</option><option value="priority">Priority first</option><option value="newest">Newest first</option></PremiumSelect></label>
        {hasExtraFilters&&<button type="button" className="chore-clear" onClick={clearFilters}>Clear filters</button>}
      </div>
      <div className="chore-list-controls">
        <span><strong>{filtered.length}</strong> {filtered.length===1?'chore':'chores'} in this view</span>
        <div className="chore-view-controls" aria-label="Task list display">
          <div className="chore-density" role="group" aria-label="Row spacing">
            <button type="button" aria-label="Comfortable view" aria-pressed={density==='comfortable'} title="Comfortable view" className={density==='comfortable'?'selected':''} onClick={()=>setDensity('comfortable')}><LayoutList size={16}/></button>
            <button type="button" aria-label="Compact view" aria-pressed={density==='compact'} title="Compact view" className={density==='compact'?'selected':''} onClick={()=>setDensity('compact')}><List size={16}/></button>
          </div>
          <label>Show <PremiumSelect aria-label="Tasks per page" value={perPage} onChange={e=>setPerPage(Number(e.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></PremiumSelect></label>
        </div>
      </div>
      <div className={`chores-scroll chore-list-${density}`} tabIndex={0} aria-label="Scrollable household tasks">
        {shown.length ? shown.map(task=>{
          const isDone=task.status==='completed',isOverdue=!isDone && task.due_date<today;
          const member=members.find(m=>Number(m.id)===Number(task.assigned_to));
          const canChangeStatus=task.assigned_to!=null && Number(task.assigned_to)===Number(currentUserId);
          const statusHint=task.assigned_to==null?'Assign this chore to yourself first':`Only ${member?.name||'the assigned member'} can update this chore`;
          const isMenuOpen=menuTaskId===task.id;
          const detail=shortChoreDescription(task.description);
          const dueText=friendlyDue(task.due_date,today);
          return <article className={`chore-item ${isDone?'is-complete':''} ${isOverdue?'is-overdue':''} ${canChangeStatus?'is-mine':''}`} key={task.id}>
            <div className={`chore-marker chore-marker-${task.status}`} aria-hidden="true">{isDone?<Check size={19}/>:task.status==='in_progress'?<Play size={17}/>:<Circle size={18}/>}</div>
            <div className="chore-main">
              <div className="chore-title-line"><strong>{task.title}</strong>
                {isOverdue&&<span className="chore-pill chore-overdue">Overdue</span>}
                {!isOverdue && !isDone && dueText==='Today'&&<span className="chore-pill chore-today">Due today</span>}
                {task.priority==='high'&&<span className="chore-pill chore-priority-high">High priority</span>}
                {task.priority==='low'&&<span className="chore-pill chore-priority-low">Low priority</span>}
              </div>
              {detail&&<p title={detail}>{detail}</p>}
              <div className="chore-details">
                <span className="chore-person" title={member?.name||'Unassigned'}><MemberAvatar member={member}/><span>{member?.name?.trim().split(/\s+/)[0]||'Unassigned'}{canChangeStatus?' (you)':''}</span></span>
                <span className={`chore-due ${isOverdue?'late':''}`} title={niceDate(task.due_date)}><CalendarDays size={14}/>{dueText}</span>
                <span className="chore-category">{task.category}</span>
                {task.repeat!=='none'&&<span className="chore-repeat"><Repeat2 size={13}/>{repeatLabel[task.repeat]}</span>}
              </div>
            </div>
            <div className="chore-actions">
              <span className={`chore-status chore-status-${task.status}`}>{statusLabel[task.status]}</span>
              <div className="chore-row-buttons">
                {canChangeStatus && task.status==='pending' && <button type="button" disabled={activeId!==null} className="chore-action-primary" onClick={()=>changeStatus(task,'in_progress')}><Play size={15}/> Start</button>}
                {canChangeStatus && task.status==='in_progress' && <button type="button" disabled={activeId!==null} className="chore-action-primary" onClick={()=>changeStatus(task,'completed')}><Check size={15}/> Complete</button>}
                {canChangeStatus && isDone && task.repeat==='none' && <button type="button" disabled={activeId!==null} className="chore-action-primary chore-reopen" onClick={()=>changeStatus(task,'pending')}><RotateCcw size={15}/> Reopen</button>}
                {!canChangeStatus&&<span className="chore-assigned-note" title={statusHint}><LockKeyhole size={13}/> View only</span>}
                {canChangeStatus && isDone && task.repeat!=='none'&&<span className="chore-done-note"><CheckCircle2 size={15}/> Done</span>}
                {isHouseholdOwner&&<button type="button" className="chore-icon-button chore-more-button" aria-label={`More options for ${task.title}`} aria-expanded={isMenuOpen} aria-controls={`chore-options-${task.id}`} disabled={activeId!==null} onClick={()=>setMenuTaskId(v=>v===task.id?null:task.id)}><MoreHorizontal size={19}/></button>}
              </div>
            </div>
            {isHouseholdOwner&&isMenuOpen&&<div id={`chore-options-${task.id}`} className="chore-options-bar">
              <span>Manage this chore</span>
              <button type="button" disabled={activeId!==null || (isDone&&task.repeat!=='none')} onClick={()=>{setMenuTaskId(null);showEdit(task)}}><Pencil size={15}/> Edit details</button>
              <button type="button" disabled={activeId!==null} className="chore-option-danger" onClick={()=>{setMenuTaskId(null);setRemoveTarget(task)}}><Trash2 size={15}/> Delete</button>
            </div>}
          </article>;
        }) : <div className="chores-empty"><div className="chores-empty-icon"><ListTodo size={26}/></div><h3>{tasks.length===0?'Your family chore board starts here':focus==='mine'&&myTasks.length===0?'No chores assigned to you yet':'Nothing in this view'}</h3>
          <p>{tasks.length===0?(isHouseholdOwner?'Add a chore, assign a family member, and keep everyone in the loop.':'The household creator can add chores and assign them to family members.'):focus==='mine'&&myTasks.length===0?'Switch to All household to see shared tasks, or ask the household creator to assign you a chore.':'Try another status, search, or filter.'}</p>
          {tasks.length===0?(isHouseholdOwner?<button className="btn btn-outline" onClick={showCreate}><Plus size={16}/> Add the first task</button>:null):<button className="btn btn-outline" onClick={()=>{clearFilters();setFocus('all')}}>Show active household tasks</button>}
        </div>}
      </div>
      <div className="chores-pagination"><span>Page {safePage} of {pageCount}</span><div>
        <button className="btn btn-outline" disabled={safePage<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/> Previous</button>
        <button className="btn btn-outline" disabled={safePage>=pageCount} onClick={()=>setPage(p=>p+1)}>Next <ChevronRight size={15}/></button>
      </div></div>
    </section>
    <div className="info-strip"><Info size={18}/> Only the household creator can add, assign, edit or delete chores. Each assigned family member can start, complete or reopen their own chores. Recurring chores schedule the next occurrence when completed.</div>
    {isHouseholdOwner&&open&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
      <div className="modal chores-modal" role="dialog" aria-modal="true" aria-labelledby="chore-modal-title"><div className="modal-heading"><div><h2 id="chore-modal-title">{editing?'Edit chore':'Add a household chore'}</h2><p>Plan something together and keep responsibilities clear.</p></div>
        <button className="chore-icon-button" type="button" onClick={close} aria-label="Close task editor"><X size={20}/></button></div>
      <form className="chores-form" onSubmit={save}>
        <label>Task name<input autoFocus required maxLength={120} placeholder="e.g. Clean the living room" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></label>
        <label>Description (optional)<textarea maxLength={1500} rows={3} placeholder="Add helpful details for your family…" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label>
        <div className="chores-form-two"><label>Category<PremiumSelect aria-label="Chore category" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATEGORIES.map(v=><option key={v}>{v}</option>)}</PremiumSelect></label>
          <label>Priority<PremiumSelect aria-label="Chore priority" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>{PRIORITIES.map(([value,name])=><option value={value} key={value}>{name}</option>)}</PremiumSelect></label></div>
        <div className="chores-form-two"><label>Due date<input type="date" required value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))}/></label>
          <label>Assign to<PremiumSelect aria-label="Assign chore to" value={form.assigned_to} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}><option value="">Unassigned</option>{members.map(m=><option key={m.id} value={String(m.id)}>{m.name}</option>)}</PremiumSelect></label></div>
        <label>Repeat<PremiumSelect aria-label="Chore repeat frequency" value={form.repeat} onChange={e=>setForm(f=>({...f,repeat:e.target.value}))}>{REPEATS.map(([value,label])=><option value={value} key={value}>{label}</option>)}</PremiumSelect></label>
        <p className="chores-form-help"><Repeat2 size={16}/> For recurring chores, the next date is scheduled after you mark the current occurrence as complete.</p>
        <div className="form-buttons"><button type="button" className="btn btn-outline" disabled={working} onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={working || !form.title.trim()}><Save size={17}/>{working?'Saving…':editing?'Save changes':'Add chore'}</button></div>
      </form></div></div>}
    {isHouseholdOwner&&removeTarget&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!working)setRemoveTarget(null)}}>
      <div className="modal chores-modal chores-confirm" role="dialog" aria-modal="true" aria-labelledby="chore-delete-title"><div className="modal-heading"><div><h2 id="chore-delete-title">Delete this chore?</h2><p>“{removeTarget.title}” will be removed from the shared family list. This cannot be undone.</p></div>
        <button className="chore-icon-button" disabled={working} aria-label="Close" onClick={()=>setRemoveTarget(null)}><X size={19}/></button></div>
        <div className="form-buttons"><button type="button" className="btn btn-outline" disabled={working} onClick={()=>setRemoveTarget(null)}>Cancel</button>
          <button type="button" className="btn btn-danger-outline" disabled={working} onClick={remove}><Trash2 size={16}/> {working?'Deleting…':'Delete chore'}</button></div></div></div>}
  </div>;
}
