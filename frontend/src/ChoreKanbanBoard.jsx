import React, {useId, useMemo, useRef, useState} from 'react';
import {
  Columns3, ChevronDown, Circle, Play, Check, CalendarDays, AlertTriangle,
  Clock3, CheckCircle2, LockKeyhole, Repeat2, RotateCcw
} from 'lucide-react';
import './ChoreKanbanBoard.css';
import {groupKanbanTasks} from './choreKanbanUtils.js';

const STAGES = [
  {key:'pending', label:'To do', subtitle:'Ready to begin', Icon:Circle, number:'01'},
  {key:'in_progress', label:'In progress', subtitle:'Currently in motion', Icon:Clock3, number:'02'},
  {key:'completed', label:'Completed', subtitle:'Another win at home', Icon:CheckCircle2, number:'03'}
];
const PRIORITY_LABEL={high:'High priority',normal:'Normal',low:'Low priority'};
const FORMAT_DATE=new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric'});
const firstName=name=>String(name||'').trim().split(/\s+/)[0]||'Unassigned';
const displayDue=date=>{
  if(!date)return 'No date';
  const parsed=new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())?date:FORMAT_DATE.format(parsed);
};

/** Read-only grouping of the existing chore records; progress actions use the parent handler. */
export default function ChoreKanbanBoard({tasks=[],members=[],today,currentUserId,activeId,activeAction,onStatusChange,focus='mine',MemberAvatar}){
  const [expanded,setExpanded]=useState(false);
  const [expandedColumns,setExpandedColumns]=useState({});
  const [mobileStage,setMobileStage]=useState('pending');
  const columnRailRef=useRef(null);
  const panelId=useId();
  const grouped=useMemo(()=>groupKanbanTasks(tasks),[tasks]);
  const count=tasks.length;
  const done=grouped.completed.length;
  const progress=count?Math.round(100*done/count):0;
  const updating=activeId!==null && activeId!==undefined;
  const scope=focus==='mine'?'My tasks':'All household';
  const memberById=id=>members.find(member=>Number(member.id)===Number(id));

  // Mobile keeps the desktop's three separate stages in a swipeable rail.
  // Stage shortcuts move the rail without changing task data or filters.
  const goToStage=key=>{
    const rail=columnRailRef.current;
    const index=STAGES.findIndex(stage=>stage.key===key);
    if(rail && index>=0 && rail.children[index] && rail.children[0]){
      rail.scrollTo({left:rail.children[index].offsetLeft-rail.children[0].offsetLeft,behavior:'smooth'});
    }
    setMobileStage(key);
  };
  const syncMobileStage=()=>{
    const rail=columnRailRef.current;
    if(!rail || rail.children.length===0)return;
    const start=rail.children[0].offsetLeft;
    let index=0;
    let bestDistance=Number.POSITIVE_INFINITY;
    for(let i=0;i<rail.children.length;i++){
      const distance=Math.abs((rail.children[i].offsetLeft-start)-rail.scrollLeft);
      if(distance<bestDistance){bestDistance=distance;index=i;}
    }
    const next=STAGES[index]?.key;
    if(next)setMobileStage(previous=>previous===next?previous:next);
  };

  return <section className="chore-kanban panel" aria-label="Collapsible household Kanban progress board">
    <button className="chore-kanban-toggle" type="button" aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)}>
      <span className="chore-kanban-toggle-icon"><Columns3 size={22}/></span>
      <span className="chore-kanban-toggle-copy">
        <span className="chore-kanban-eyebrow">VISUAL PROGRESS TRACKER</span>
        <strong>Kanban Progress Board</strong>
        <span>Follow chores from To do to Completed at a glance.</span>
      </span>
      <span className="chore-kanban-toggle-right">
        <span className="chore-kanban-mini-stages" aria-hidden="true"><i/><i/><i/></span>
        <span className="chore-kanban-toggle-label">{expanded?'Hide board':'Show board'}</span>
        <ChevronDown size={19} className={`chore-kanban-chevron ${expanded?'is-expanded':''}`}/>
      </span>
    </button>
    {expanded && <div id={panelId} className="chore-kanban-body">
      <div className="chore-kanban-intro">
        <div>
          <span className="chore-kanban-scope">{scope} <span aria-hidden="true">·</span> {count} {count===1?'chore':'chores'}</span>
          <p>Shows every progress stage for the selected scope. Search, priority and assignee filters apply; the list's status tab and pagination do not.</p>
        </div>
        <div className="chore-kanban-progress" aria-label={`${done} of ${count} matching chores completed (${progress}%)`}>
          <div className="chore-kanban-progress-ring" style={{'--kanban-progress':`${progress}%`}} aria-hidden="true"><span>{progress}%</span></div>
          <div className="chore-kanban-progress-copy"><strong>Household momentum</strong><span>{done} of {count} finished</span></div>
        </div>
      </div>
      <div className="chore-kanban-mobile-navigation" role="group" aria-label="Jump to Kanban stage">
        {STAGES.map(stage=><button key={stage.key} type="button"
          className={`chore-kanban-stage-shortcut chore-kanban-stage-shortcut-${stage.key} ${mobileStage===stage.key?'is-selected':''}`}
          aria-pressed={mobileStage===stage.key} onClick={()=>goToStage(stage.key)}>
          <span>{stage.label}</span><b>{grouped[stage.key]?.length||0}</b>
        </button>)}
      </div>
      <p className="chore-kanban-swipe-hint">Swipe sideways to view each stage, or tap a stage above.</p>
      <div className="chore-kanban-columns" ref={columnRailRef} onScroll={syncMobileStage}>
        {STAGES.map(({key,label,subtitle,Icon,number})=>{
          const items=grouped[key]||[];
          const showAll=expandedColumns[key]===true;
          const displayed=showAll?items:items.slice(0,6);
          return <div key={key} className={`chore-kanban-column chore-kanban-column-${key}`} aria-label={`${label}: ${items.length} ${items.length===1?'task':'tasks'}`}>
            <div className="chore-kanban-column-header">
              <span className="chore-kanban-column-icon"><Icon size={18}/></span>
              <span className="chore-kanban-column-title"><span className="chore-kanban-column-step">STAGE {number}</span><strong>{label}</strong><small>{subtitle}</small></span>
              <span className="chore-kanban-column-count" aria-label={`${items.length} chores`}>{items.length}</span>
            </div>
            <div className="chore-kanban-column-track" aria-hidden="true"><span style={{width:count?`${Math.round(items.length/count*100)}%`:'0%'}}/></div>
            <div className="chore-kanban-card-list">
              {displayed.map(task=>{
                const member=memberById(task.assigned_to);
                const mine=task.assigned_to!=null && Number(task.assigned_to)===Number(currentUserId);
                const overdue=task.status!=='completed' && Boolean(task.due_date) && task.due_date<today;
                const busy=activeId===task.id;
                const next=task.status==='pending'?'in_progress':task.status==='in_progress'?'completed':'pending';
                const canReopen=task.status==='completed'&&task.repeat==='none';
                const showAction=mine && (task.status!=='completed'||canReopen);
                const actionLabel=task.status==='pending'?'Start task':task.status==='in_progress'?'Mark complete':'Reopen';
                return <article className={`chore-kanban-card chore-kanban-card-${key} ${overdue?'is-overdue':''}`} key={task.id}>
                  <div className="chore-kanban-card-top">
                    <span className={`chore-kanban-priority chore-kanban-priority-${task.priority||'normal'}`}>{PRIORITY_LABEL[task.priority]||'Normal'}</span>
                    {overdue&&<span className="chore-kanban-overdue"><AlertTriangle size={12}/> Overdue</span>}
                  </div>
                  <h4 title={task.title}>{task.title}</h4>
                  {task.description?.trim() && <p className="chore-kanban-card-description" title={task.description}>{task.description}</p>}
                  <div className="chore-kanban-card-meta">
                    <span className="chore-kanban-member" title={member?.name||'Unassigned'}>
                      <MemberAvatar member={member}/>{firstName(member?.name)}{mine?' (you)':''}
                    </span>
                    <span className={overdue?'chore-kanban-date is-overdue':'chore-kanban-date'} title={task.due_date||'No due date'}><CalendarDays size={13}/>{displayDue(task.due_date)}</span>
                  </div>
                  <div className="chore-kanban-card-tags">
                    {task.category&&<span className="chore-kanban-category">{task.category}</span>}
                    {task.repeat && task.repeat!=='none'&&<span className="chore-kanban-repeat"><Repeat2 size={12}/>{task.repeat}</span>}
                  </div>
                  <div className="chore-kanban-card-footer">
                    {busy ? <span className="chore-kanban-saving" role="status"><span className="chore-status-spinner" aria-hidden="true"/>{activeAction==='in_progress'?'Starting…':activeAction==='completed'?'Completing…':'Reopening…'}</span>
                    : showAction ? <button type="button" className="chore-kanban-action" disabled={updating} onClick={()=>onStatusChange(task,next)} aria-label={`${actionLabel}: ${task.title}`}>
                      {task.status==='pending'?<Play size={14}/>:task.status==='in_progress'?<Check size={14}/>:<RotateCcw size={14}/>} {actionLabel}
                    </button>
                    : <span className="chore-kanban-readonly">{task.status==='completed'?<><CheckCircle2 size={14}/> Done</>:<><LockKeyhole size={13}/> View only</>}</span>}
                  </div>
                </article>;
              })}
              {items.length===0&&<div className="chore-kanban-empty"><span aria-hidden="true">✦</span><p>No chores in {label.toLowerCase()}.</p></div>}
            </div>
            {items.length>6&&<button type="button" className="chore-kanban-more" onClick={()=>setExpandedColumns(previous=>({...previous,[key]:!previous[key]}))}>
              {showAll?'Show fewer':`Show all ${items.length} chores`} <ChevronDown className={showAll?'is-expanded':''} size={15}/>
            </button>}
          </div>;
        })}
      </div>
      <p className="chore-kanban-footnote"><LockKeyhole size={14}/> Only the assigned family member can move a chore forward. Dragging is disabled to prevent accidental status changes.</p>
    </div>}
  </section>;
}
