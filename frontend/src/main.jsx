import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams} from 'react-router-dom';
import {
  House, LayoutDashboard, CalendarDays, Megaphone, Zap, Wallet, Settings2, Menu, X, Bell, ChevronRight,
  Plus, ArrowUpRight, ArrowLeft, CheckCircle2, AlertCircle, Clock3, CreditCard, CalendarCheck, Phone,
  ShieldCheck, Sun, Moon, Type, Copy, LogOut, Users, Sparkles, TrendingUp, CircleHelp, Trash2, Pencil,
  Save, Check, Search, Filter, ReceiptText, CalendarPlus, Info, Eye, LockKeyhole, UserPlus, BarChart3,
  MessageSquareText, SlidersHorizontal, RotateCcw, Home as HomeIcon, Send, ChevronLeft, ClipboardCheck,
  Refrigerator, WashingMachine, Tv, Fan, Lightbulb, Wind, Plug, Power, MoreHorizontal, Camera, UploadCloud, ZoomIn, ZoomOut, Image as ImageIcon
} from 'lucide-react';
import './styles.css';
import {CITY_OPTIONS, getSunHours, manilaClock, formatSunTime, formatDaylight} from './sunHours.js';
import heroWaveAvatar from './assets/hero-wave-avatar.png';
import MonthlyBillsChart from './MonthlyBillsChart.jsx';
import HouseholdBillsTable from './HouseholdBillsTable.jsx';
import {AnnouncementRecords,ContactRecords} from './HouseholdInformationLists.jsx';
import HouseholdTasks from './HouseholdTasks.jsx';
import ElectricityUsageSection from './ElectricityUsageSection.jsx';
import PageHero from './PageHero.jsx';
import {ListTodo} from 'lucide-react';
import './premium.css';
import './mobile.css';

// The Haven brand emblem is separate from each household's family identity.
// The image is bundled in frontend/public/branding/ and has a transparent background.
function HavenLogo({className=''}) {
  return <img src="/branding/haven-home-gold-emerald.png" className={`haven-brand-emblem ${className}`.trim()} alt="" aria-hidden="true" draggable="false" decoding="async"/>;
}

const Ctx=createContext(null);
const useApp=()=>useContext(Ctx);
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateFrom=(s)=>new Date(`${s}T12:00:00`);
const niceDate=(s,opts={month:'short',day:'numeric',year:'numeric'})=>s?new Intl.DateTimeFormat('en-PH',opts).format(dateFrom(s)):'—';
const php=(n)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(Number(n)||0);
const eTime=(t)=>{if(!t)return '';const [h,m]=t.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`};
const friendlyError=(e)=>typeof e?.detail==='string'?e.detail:(Array.isArray(e?.detail)?e.detail.map(x=>x.msg).join('; '):'Something went wrong. Please try again.');
async function api(path,method='GET',payload){
  const opt={method,credentials:'same-origin',headers:{}};
  if(method!=='GET')opt.headers['X-HIC-Action']='1';
  if(payload!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(payload)}
  let response;
  try{response=await fetch(`/api${path}`,opt)}catch{throw Error('Unable to reach the server. Check that the backend is running.');}
  const ct=response.headers.get('content-type')||'';
  const json=ct.includes('application/json')?await response.json():{};
  if(!response.ok){const err=new Error(friendlyError(json));err.status=response.status;throw err;}
  return json;
}
// A fixed allowlist of avatars bundled under frontend/public/avatars.
const PROFILE_AVATARS = [
  {id:'male_01',label:'Avatar 1'}, {id:'female_01',label:'Avatar 2'},
  {id:'male_02',label:'Avatar 3'}, {id:'female_02',label:'Avatar 4'},
  {id:'male_03',label:'Avatar 5'}, {id:'female_03',label:'Avatar 6'},
  {id:'male_04',label:'Avatar 7'}, {id:'female_04',label:'Avatar 8'},
  {id:'male_05',label:'Avatar 9'}, {id:'female_05',label:'Avatar 10'}
];

function HouseholdFamilyIcon(){
  return <div className="house-avatar family-avatar" aria-hidden="true"><Users size={18} strokeWidth={2.15}/></div>;
}
const profileAvatarId=(member,index=0)=>PROFILE_AVATARS.some(a=>a.id===member?.avatar_id)
  ? member.avatar_id : PROFILE_AVATARS[(Math.max(1,Number(member?.id)||index+1)-1)%PROFILE_AVATARS.length].id;
function ProfileAvatar({member,index=0,className=''}){
  const custom=member?.avatar_id==='custom'&&member?.photo_version;
  const id=profileAvatarId(member,index);
  const src=custom?`/api/profile/photo/${member.id}?v=${encodeURIComponent(member.photo_version)}`:`/avatars/${id}.png`;
  return <img className={`profile-avatar-image ${className}`} src={src} alt={`${custom?'Profile photo':'Profile icon'} for ${member?.name||'household member'}`} loading="lazy"/>;
}

// Update the signed-in user's avatar everywhere from one React snapshot.
// Built-in icons are local assets; the network save must not delay their display.
function withOptimisticAvatar(snapshot,userId,avatar){
  if(!snapshot || snapshot.user?.id!==userId)return snapshot;
  const patch={avatar_id:avatar.avatar_id,photo_version:avatar.photo_version??null};
  return {...snapshot,user:{...snapshot.user,...patch},members:Array.isArray(snapshot.members)
    ?snapshot.members.map(member=>member.id===userId?{...member,...patch}:member)
    :snapshot.members};
}

// Remove old demonstration prefixes from displayed record text only.
// Keep Supabase values and is_demo metadata unchanged for later cleanup.
const displayRecordText=(value,isDemo,fallback='')=>{
  if(typeof value!=='string'||!isDemo)return value||fallback;
  const cleaned=value
    .replace(/^\s*sample\s+announcement\s*[:\-]\s*/i,'')
    .replace(/^\s*(?:sample|example)(?:\s*[:\-]\s*|\s+|$)/i,'')
    .trim();
  return cleaned||fallback;
};
const badgeColor=(category)=>({Family:'green',School:'blue',Health:'rose',Other:'neutral',Utilities:'blue',Groceries:'orange',Education:'purple',Internet:'blue'})[category]||'neutral';

// Continuous preferences fit into the existing VARCHAR(10) Supabase columns.
// Legacy light/dark and normal/large/extra records remain fully compatible.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const themeAmount=(value)=>value==='dark'?100:value==='light'?0:clamp(Number(String(value||'').replace('mix:',''))||0,0,100);
const textPixels=(value)=>value==='large'?17:value==='extra'?19:value==='normal'?15:clamp(Number(String(value||'').replace('size:',''))||15,13,20);
const encodeTheme=(n)=>n<=0?'light':n>=100?'dark':`mix:${Math.round(n)}`;
const encodeText=(n)=>Math.abs(n-15)<.001?'normal':`size:${Number(n).toFixed(1)}`;
// Apply *each slider increment* locally, without waiting for a network request.
function applyDisplayPreferences(preferences){
  const root=document.documentElement;
  const theme=themeAmount(preferences?.theme);
  // Luxe is a dedicated visual design system; the original continuous Light/Dark
  // intensity slider still works when Luxe is not selected.
  const isLuxe=preferences?.theme==='luxe';
  root.dataset.theme=isLuxe?'luxe':'fluid';
  root.style.setProperty('--theme-light',`${100-theme}%`);
  root.style.setProperty('--theme-dark',`${theme}%`);
  root.style.setProperty('--theme-progress',`${theme}%`);
  // Keep foreground legible while the surrounding surfaces gradually darken.
  // Solid contrast-adaptive text avoids unreadable gray-on-gray midpoints.
  const darkInk=theme>=52;
  root.style.setProperty('--fluid-ink', darkInk?'#f4fbf6':'#182d25');
  root.style.setProperty('--fluid-muted', darkInk?'#c2dbcd':'#405c50');
  root.style.setProperty('--fluid-accent', darkInk?'#a0dfb9':'#267758');
  root.style.setProperty('--fluid-accent-strong', darkInk?'#c0e8cd':'#185c45');
  const pixels=textPixels(preferences?.text_size);
  // Retain existing large-text responsive safety rules, while the actual
  // font-size remains an exact, continuously adjusted pixel value.
  root.dataset.textSize=pixels>=18.5?'extra':pixels>=16.5?'large':'normal';
  root.style.fontSize=`${pixels}px`;
  root.style.colorScheme=isLuxe||theme>=52?'dark':'light';
}
function Provider({children}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(null);
  const [preferencesSaving,setPreferencesSaving]=useState(false);
  const [avatarSaving,setAvatarSaving]=useState(false);
  // Keep avatar changes instantly visible while the latest selection is saved.
  const avatarSync=useRef({userId:null,confirmed:null,desired:null,running:false,edited:false});
  // A separate queue keeps rapid theme/text-size clicks in order without reloading /bootstrap.
  // Keep the latest selection visible even while a previous request is still in flight.
  const preferenceSync=useRef({userId:null,confirmed:null,desired:null,running:false});
  // In-flight chore statuses remain visible even if another action refreshes bootstrap.
  const pendingTaskStatus=useRef(new Map());
  // Reuse the same household hydration for a normal refresh AND authentication.
  // The ?full=1 login/register/join response already includes the snapshot,
  // so the login screen never needs an additional serial /bootstrap request.
  const acceptBootstrap=(fetched)=>{
    const sync=preferenceSync.current;
    if(sync.userId!==fetched.user.id){
      preferenceSync.current={userId:fetched.user.id,confirmed:fetched.preferences,desired:null,running:false,edited:false};
    }else if(sync.desired||sync.edited){
      // Other dashboard actions may refresh during a slow settings save.
      // Avoid replacing the locally selected look with an older server snapshot.
      fetched.preferences=sync.desired||sync.confirmed;
    }else{
      sync.confirmed=fetched.preferences;
    }
    const avatar=avatarSync.current;
    if(avatar.userId!==null && avatar.userId!==fetched.user.id){
      // Do not carry an old account's pending chore edits into another login.
      pendingTaskStatus.current.clear();
    }
    if(avatar.userId!==fetched.user.id){
      avatarSync.current={userId:fetched.user.id,
        confirmed:{avatar_id:fetched.user.avatar_id??null,photo_version:fetched.user.photo_version??null},
        desired:null,running:false,edited:false};
    }else if(avatar.edited){
      // Another operation might refresh /bootstrap while an avatar save is in flight.
      // Never allow its older snapshot to flash on screen over the latest selection.
      const preview=avatar.desired||avatar.confirmed;
      if(preview){
        if(!avatar.desired && fetched.user.avatar_id===preview.avatar_id &&
           (fetched.user.photo_version??null)===(preview.photo_version??null)){
          avatar.edited=false;
        }else{
          Object.assign(fetched,withOptimisticAvatar(fetched,avatar.userId,preview));
        }
      }
    }else{
      avatar.confirmed={avatar_id:fetched.user.avatar_id??null,photo_version:fetched.user.photo_version??null};
    }
    if(pendingTaskStatus.current.size && Array.isArray(fetched.tasks)){
      fetched.tasks=fetched.tasks.map(task=>{
        const pending=pendingTaskStatus.current.get(task.id);
        return pending && pending.userId===fetched.user.id ? {...task,status:pending.status} : task;
      });
    }
    setData(fetched);setError('');return fetched;
  };
  const refresh=async()=>acceptBootstrap(await api('/bootstrap'));
  useEffect(()=>{(async()=>{try{await refresh()}catch(e){if(e.status!==401)setError(e.message);setData(null)}finally{setLoading(false)}})()},[]);
  useEffect(()=>{applyDisplayPreferences(data?.preferences)},[data?.preferences]);
  const toast=(message,type='success')=>setNotice({message,type,id:Date.now()});
  const run=async(path,method,payload,success)=>{try{const r=await api(path,method,payload);await refresh();if(success)toast(success);return r}catch(e){toast(e.message,'error');throw e}};
  const changeTaskStatus=async(task,nextStatus)=>{
    const userId=data?.user?.id;
    if(!userId || task.assigned_to!==userId){
      toast('Only the family member assigned to this chore can change its status.','error');
      return false;
    }
    if(pendingTaskStatus.current.has(task.id))return false;
    const previousStatus=task.status;
    // Optimistic state update: all task counters, rows, and the dashboard react
    // immediately, before even one database round-trip completes.
    pendingTaskStatus.current.set(task.id,{userId,status:nextStatus});
    setData(prev=>prev?.user?.id===userId?{
      ...prev,tasks:(prev.tasks||[]).map(t=>t.id===task.id?{...t,status:nextStatus}:t)
    }:prev);
    try{
      const result=await api(`/tasks/${task.id}/status`,'PATCH',{status:nextStatus});
      if(pendingTaskStatus.current.get(task.id)?.userId!==userId)return false;
      pendingTaskStatus.current.delete(task.id);
      setData(prev=>{
        if(prev?.user?.id!==userId)return prev;
        const updated=(prev.tasks||[]).map(t=>t.id===task.id?{...t,...result}:t);
        if(result.next_task && !updated.some(t=>t.id===result.next_task.id))updated.push(result.next_task);
        return {...prev,tasks:updated};
      });
      toast(nextStatus==='completed'?(task.repeat!=='none'?'Chore completed. Next occurrence scheduled.':'Chore completed.'):
        nextStatus==='in_progress'?'Chore started.':'Chore status updated.');
      return true;
    }catch(e){
      if(pendingTaskStatus.current.get(task.id)?.userId===userId){
        pendingTaskStatus.current.delete(task.id);
        setData(prev=>prev?.user?.id===userId?{
          ...prev,tasks:(prev.tasks||[]).map(t=>t.id===task.id?{...t,status:previousStatus}:t)
        }:prev);
        toast(`Unable to save chore. Previous status restored. ${e.message}`,'error');
      }
      return false;
    }
  };
  const resetAvatarSync=()=>{
    avatarSync.current={userId:null,confirmed:null,desired:null,running:false,edited:false};
    setAvatarSaving(false);
  };
  const selectAvatar=avatarId=>{
    if(!data?.user || !PROFILE_AVATARS.some(avatar=>avatar.id===avatarId))return;
    const userId=data.user.id;
    if(avatarSync.current.userId!==userId){
      avatarSync.current={userId,
        confirmed:{avatar_id:data.user.avatar_id??null,photo_version:data.user.photo_version??null},
        desired:null,running:false,edited:false};
    }
    const state=avatarSync.current;
    const selected=state.desired||state.confirmed;
    if(selected?.avatar_id===avatarId && !selected?.photo_version)return;
    const preview={avatar_id:avatarId,photo_version:null};
    state.desired=preview;
    state.edited=true;
    // Immediate state update: sidebar, header, Settings, and family hero update together.
    setData(prev=>withOptimisticAvatar(prev,userId,preview));
    setAvatarSaving(true);
    if(state.running)return;
    state.running=true;
    void (async()=>{
      try{
        while(state.desired && avatarSync.current===state){
          const target=state.desired;
          try{
            // Only the avatar PATCH: do not wait for an unrelated /bootstrap reload.
            const saved=await api('/profile/avatar','PATCH',{avatar_id:target.avatar_id});
            if(avatarSync.current!==state)break;
            state.confirmed={avatar_id:saved.avatar_id,photo_version:saved.photo_version??null};
            if(state.desired===target){
              state.desired=null;
              toast('Your profile icon has been saved.');
            }
          }catch(e){
            if(avatarSync.current!==state)break;
            if(state.desired===target){
              state.desired=null;
              setData(prev=>withOptimisticAvatar(prev,userId,state.confirmed));
              toast(`Could not save your profile icon. Previous selection restored. ${e.message}`,'error');
            }
            // If the user selected a newer icon in the meantime, save it next.
          }
        }
      }finally{
        state.running=false;
        if(avatarSync.current===state)setAvatarSaving(false);
      }
    })();
  };
  const updatePreferences=changes=>{
    if(!data?.user)return;
    const userId=data.user.id;
    const sync=preferenceSync.current;
    if(sync.userId!==userId){
      // Defensive initialization if preferences are changed before another refresh.
      preferenceSync.current={userId,confirmed:data.preferences,desired:null,running:false,edited:false};
    }
    const state=preferenceSync.current;
    const current=state.desired||data.preferences;
    const selected={...current,...changes};
    if(selected.theme===current.theme && selected.text_size===current.text_size)return;
    state.desired=selected;
    state.edited=true;
    applyDisplayPreferences(selected);
    setData(prev=>prev?.user?.id===userId?{...prev,preferences:selected}:prev);
    setPreferencesSaving(true);
    if(state.running)return;
    state.running=true;
    void (async()=>{
      try{
        while(state.desired&&preferenceSync.current===state){
          const target=state.desired;
          try{
            // This endpoint returns only preferences. No extra /bootstrap request is needed.
            const saved=await api('/settings','PATCH',target);
            if(preferenceSync.current!==state)break;
            state.confirmed={theme:saved.theme,text_size:saved.text_size};
            if(state.desired===target){
              state.desired=null;
              toast('Display preferences saved.');
            }
          }catch(e){
            if(preferenceSync.current!==state)break;
            if(state.desired===target){
              state.desired=null;
              const restored=state.confirmed||{theme:'light',text_size:'normal'};
              applyDisplayPreferences(restored);
              setData(prev=>prev?.user?.id===userId?{...prev,preferences:restored}:prev);
              toast(`Preferences could not be saved; previous settings restored. ${e.message}`,'error');
            }
            // If another click happened while this request was running, save that
            // newer selection next instead of rolling the UI back prematurely.
          }
        }
      }finally{
        state.running=false;
        if(preferenceSync.current===state)setPreferencesSaving(false);
      }
    })();
  };
  const logout=async()=>{pendingTaskStatus.current.clear();resetAvatarSync();preferenceSync.current={userId:null,confirmed:null,desired:null,running:false};setPreferencesSaving(false);try{await api('/auth/logout','POST')}catch{}setData(null);toast('You have signed out.')};
  return <Ctx.Provider value={{data,setData,loading,error,setError,refresh,acceptBootstrap,run,logout,toast,notice,setNotice,updatePreferences,preferencesSaving,selectAvatar,avatarSaving,resetAvatarSync,changeTaskStatus}}>{children}</Ctx.Provider>
}
function Toast(){const {notice,setNotice}=useApp();useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(null),4800);return()=>clearTimeout(id)},[notice,setNotice]);return notice&&<div role="status" aria-live="polite" className={`toast ${notice.type==='error'?'toast-error':''}`}><span className="toasticon">{notice.type==='error'?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>}</span><span>{notice.message}</span><button aria-label="Dismiss notification" className="icon-button" onClick={()=>setNotice(null)}><X size={16}/></button></div>}
function Button({children,variant='primary',icon:Icon,loading=false,...props}){return <button {...props} disabled={props.disabled||loading} className={`btn btn-${variant} ${props.className||''}`} >{loading?<span className="mini-spinner"/>:Icon&&<Icon size={17}/>}<span>{children}</span></button>}
function IconButton({icon:Icon,label,...props}){return <button {...props} type={props.type||'button'} className={`icon-button ${props.className||''}`} aria-label={label} title={label}><Icon size={19}/></button>}
function Pill({children,color='neutral'}){return <span className={`pill pill-${color}`}>{children}</span>}
function Panel({title,subtitle,action,children,className='',id}){return <section id={id} className={`panel ${className}`}><div className="panel-top"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>}
function Empty({icon:Icon=Info,title='Nothing here yet',description,action}){return <div className="empty"><div className="empty-icon"><Icon size={23}/></div><h3>{title}</h3><p>{description}</p>{action}</div>}
function Field({label,as='input',hint,...props}){const Comp=as;return <label className="field"><span>{label}</span><Comp {...props} className="field-input" />{hint&&<small>{hint}</small>}</label>}
function Modal({title,subtitle,close,children}){useEffect(()=>{const key=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[close]);return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div role="dialog" aria-modal="true" aria-label={title} className="modal"><div className="modal-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><IconButton icon={X} label="Close dialog" onClick={close}/></div>{children}</div></div>}
const nav=[{to:'/dashboard',label:'Dashboard',icon:LayoutDashboard},{to:'/calendar',label:'Family Calendar',icon:CalendarDays},{to:'/household',label:'Household Information',icon:Megaphone},{to:'/tasks',label:'Tasks & Chores',icon:ListTodo},{to:'/expenses',label:'Household Expenses',icon:Wallet},{to:'/settings',label:'Settings & Accessibility',icon:Settings2}];
function AppShell(){const {data,loading,error,logout}=useApp();const [mobile,setMobile]=useState(false);const loc=useLocation();
  useEffect(()=>{setMobile(false);window.scrollTo(0,0)},[loc.pathname]);
  useEffect(()=>{
    if(!mobile)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onEscape=(event)=>{if(event.key==='Escape')setMobile(false)};
    document.addEventListener('keydown',onEscape);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',onEscape)};
  },[mobile]);
  // Scroll to the destination section after React Router renders the target page.
  // Class-based animation is temporary; the browser's hash remains shareable.
  useEffect(()=>{
    if(loading||!data)return;
    const targetId=loc.hash.slice(1);
    if(!['calendar-overview','household-bills','family-chore-board','household-announcements'].includes(targetId))return;
    let retryTimer,clearTimer;
    retryTimer=window.setTimeout(()=>{
      const target=document.getElementById(targetId);
      if(!target)return;
      target.classList.add('haven-destination-focus');
      const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
      clearTimer=window.setTimeout(()=>target.classList.remove('haven-destination-focus'),2600);
    },90);
    return()=>{window.clearTimeout(retryTimer);window.clearTimeout(clearTimer);document.getElementById(targetId)?.classList.remove('haven-destination-focus')};
  },[loc.key,loc.hash,loading,!!data]);
  if(loading)return <div className="boot"><div className="spin"/><p>Opening your family centre...</p></div>;if(!data)return <Auth/>;
  return <div className="app-root"><div className={`sidebar-scrim ${mobile?'visible':''}`} onClick={()=>setMobile(false)}/><aside className={`sidebar ${mobile?'sidebar-open':''}`}><div className="brand"><div className="brand-mark haven-logo-frame"><HavenLogo/></div><div><strong>haven<span>.</span></strong><small>FAMILY INFORMATION CENTRE</small></div><IconButton className="side-close" icon={X} label="Close menu" onClick={()=>setMobile(false)}/></div><div className="household-chip"><HouseholdFamilyIcon/><div className="truncate"><strong>{data.user.household.name}</strong><span>Our shared space</span></div><ChevronRight size={15}/></div><div className="nav-label">WORKSPACE</div><nav className="side-nav" aria-label="Main navigation">{nav.slice(0,5).map(n=><NavLink key={n.to} to={n.to} className={({isActive})=>`nav-link ${isActive||(n.to!='/dashboard'&&loc.pathname.startsWith(n.to+'/'))?'active':''}`}><n.icon size={19}/><span>{n.label}</span>{loc.pathname===n.to&&<span className="nav-dot"/>}</NavLink>)}</nav><div className="nav-label nav-label-bottom">PREFERENCES</div><nav className="side-nav"><NavLink to="/settings" className={({isActive})=>`nav-link ${isActive?'active':''}`}><Settings2 size={19}/><span>Settings & Accessibility</span></NavLink></nav><div className="sidebar-bottom"><div className="side-help"><Sparkles size={18}/><strong>A little more organized.</strong><span>One place for the things that make a house a home.</span></div><div className="side-profile"><div className="avatar"><ProfileAvatar member={data.user}/></div><div className="truncate"><strong>{data.user.name}</strong><small>Household member</small></div><Link className="icon-button" to="/settings" aria-label="Account settings"><Settings2 size={18}/></Link></div></div></aside>
  <div className="app-main"><header className="topbar"><div className="topbar-left"><IconButton className="mobile-menu" icon={Menu} label="Open navigation" onClick={()=>setMobile(true)}/><div className="breadcrumbs"><span>Household workspace</span><ChevronRight size={15}/><strong>{nav.find(x=>loc.pathname.startsWith(x.to))?.label||'Dashboard'}</strong></div></div><div className="topbar-right"><span className="today-date"><CalendarDays size={16}/>{niceDate(localToday(),{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</span><Link to="/settings#profile-avatar" className="topbar-user" title="Choose your profile avatar" aria-label="Open profile avatar settings"><ProfileAvatar member={data.user}/></Link><button type="button" className="topbar-signout" onClick={logout} aria-label="Sign out of Haven Home" title="Sign out"><LogOut size={16} aria-hidden="true"/><span>Sign out</span></button></div></header><main className="content"><Routes><Route path="/dashboard" element={<Dashboard/>}/><Route path="/calendar" element={<Calendar/>}/><Route path="/calendar/new" element={<ReminderForm/>}/><Route path="/calendar/:id" element={<ReminderDetail/>}/><Route path="/household" element={<Household/>}/><Route path="/tasks" element={<TasksRoute/>}/><Route path="/energy" element={<Navigate to="/tasks" replace/>}/><Route path="/expenses" element={<Expenses/>}/><Route path="/expenses/:id" element={<BillDetail/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></main><footer className="footer">Haven Home <span>•</span> Made for your household <span>•</span> Prototype Version 1</footer>
  <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
    {[{to:'/dashboard',label:'Home',icon:LayoutDashboard},{to:'/calendar',label:'Calendar',icon:CalendarDays},{to:'/tasks',label:'Chores',icon:ListTodo},{to:'/expenses',label:'Expenses',icon:Wallet}].map(item=><NavLink key={item.to} to={item.to} className={({isActive})=>`mobile-bottom-link${isActive||loc.pathname.startsWith(item.to+'/')?' active':''}`}><item.icon aria-hidden="true" size={20}/><span>{item.label}</span></NavLink>)}
    <button type="button" className={`mobile-bottom-link${mobile||loc.pathname.startsWith('/household')||loc.pathname.startsWith('/settings')?' active':''}`} onClick={()=>setMobile(true)} aria-label="Open all pages" aria-expanded={mobile}><Menu size={20} aria-hidden="true"/><span>More</span></button>
  </nav></div><Toast/></div>
}
function Auth(){
  const {acceptBootstrap,toast,error}=useApp();
  const [mode,setMode]=useState('login');
  const [form,setForm]=useState({name:'',email:'',password:'',household_name:'',invite_code:''});
  const [working,setWorking]=useState(false);
  const [msg,setMsg]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const change=e=>setForm(p=>({...p,[e.target.name]:e.target.value}));
  const selectMode=next=>{setMode(next);setMsg('');setShowPassword(false)};
  const submit=async e=>{
    e.preventDefault();setMsg('');setWorking(true);
    try{
      // One authenticated round trip returns the household snapshot. Do not
      // fetch it again before opening the Dashboard.
      const snapshot=await api('/auth/'+(mode==='create'?'register':mode)+'?full=1','POST',form);
      acceptBootstrap(snapshot);
      toast(mode==='login'?'Welcome home!':mode==='join'?'Welcome to your household!':'Your family centre is ready!');
    }catch(e){setMsg(e.message)}finally{setWorking(false)}
  };
  return <main className="auth-root">
    <section className="auth-art" aria-label="Welcome to Haven Home">
      <div className="auth-art-pattern" aria-hidden="true"/>
      <div className="auth-brand">
        <span className="brand-mark haven-logo-frame"><HavenLogo/></span>
        <span className="auth-brand-text"><strong>haven<span>.</span></strong><small>FAMILY INFORMATION CENTRE</small></span>
      </div>
      <div className="auth-art-content">
        <Pill color="mint"><Sparkles size={13}/> A BETTER WAY TO BE HOME</Pill>
        <h1>Everything home,<br/><em>beautifully together.</em></h1>
        <p>One thoughtful space for the moments, plans, and little details that keep your household in sync.</p>
        <div className="auth-benefits" aria-label="Haven Home features">
          <span><CalendarCheck size={16}/> Shared plans</span>
          <span><Wallet size={16}/> Simple budgets</span>
          <span><HavenLogo className="haven-benefit-emblem"/> Family first</span>
        </div>
        <div className="auth-preview-art" aria-label="Illustration of a Haven Home household dashboard">
          <img
            src="/login/haven-home-glance-card.png"
            alt="Haven Home at a glance: family dinner reminder, bills overview, and home energy chart"
            className="auth-preview-art-image"
            width="1475"
            height="846"
            loading="eager"
            decoding="async"
          />
        </div>
      </div>
      <div className="auth-art-footer"><ShieldCheck size={16}/> Your family space, thoughtfully private.</div>
    </section>
    <section className="auth-form-side" aria-label="Account access">
      <div className="auth-form-glow" aria-hidden="true"/>
      <div className="auth-card">
        <div className="auth-mobile-logo"><HavenLogo/> haven.</div>
        <div className="auth-form-head"><span className="auth-form-head-mark haven-logo-frame"><HavenLogo/></span><div><strong>HAVEN HOME</strong><span>Your family's everyday essentials</span></div></div>
        <span className="auth-eyebrow">YOUR PRIVATE HOUSEHOLD SPACE</span>
        <h2>{mode==='login'?'Welcome back.':mode==='create'?'Make yourself at home.':'Better together.'}</h2>
        <p className="auth-lead">{mode==='login'?'Sign in to pick up right where your family left off.':mode==='create'?'Create a welcoming space to organize family life.':'Join the home space your family has already created.'}</p>
        <div className="auth-switch" role="group" aria-label="Choose account action">
          <button type="button" aria-pressed={mode==='login'} className={mode==='login'?'chosen':''} onClick={()=>selectMode('login')}>Sign in</button>
          <button type="button" aria-pressed={mode==='create'} className={mode==='create'?'chosen':''} onClick={()=>selectMode('create')}>Create household</button>
          <button type="button" aria-pressed={mode==='join'} className={mode==='join'?'chosen':''} onClick={()=>selectMode('join')}>Join family</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode!=='login'&&<Field label="Your full name" name="name" value={form.name} onChange={change} required minLength={2} autoComplete="name" placeholder="e.g. Alex Santos"/>}
          {mode==='create'&&<Field label="Household name" name="household_name" value={form.household_name} onChange={change} required minLength={2} placeholder="e.g. The Santos Family"/>}
          {mode==='join'&&<Field label="Household invite code" name="invite_code" value={form.invite_code} onChange={change} required placeholder="Code from a family member"/>}
          <Field label="Email address" type="email" name="email" value={form.email} onChange={change} required autoComplete="email" placeholder="you@example.com"/>
          <div className="auth-password-field"><Field label="Password" type={showPassword?'text':'password'} name="password" value={form.password} onChange={change} required minLength={mode==='login'?undefined:8} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='login'?'Enter your password':'At least 8 characters'}/><button type="button" className="auth-password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword}>{showPassword?'Hide':'Show'}</button></div>
          {(msg||error)&&<div role="alert" className="inline-error"><AlertCircle size={17}/>{msg||error}</div>}
          <Button type="submit" loading={working} className="auth-submit">{working?(mode==='login'?'Signing you in…':mode==='create'?'Creating your family space…':'Joining your family space…'):(mode==='login'?'Continue to Haven':mode==='create'?'Create family space':'Join family space')} {!working&&<ArrowUpRight size={18}/>}</Button>
        </form>
        <div className="auth-safe"><ShieldCheck size={18}/><span>Private to your household. Your family information is shared only with members of your family space.</span></div>
        <p className="auth-footnote">A little more connected. A lot more organized.</p>
      </div>
    </section>
  </main>;
}
function PageHeader({eyebrow,title,description,actions}){return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="page-actions">{actions}</div></div>}
function StatCard({label,value,sub,icon:Icon,tone='neutral',to}){
  const contents=<><div className="stat-top"><span>{label}</span><div className="stat-symbol"><Icon size={19}/></div></div><strong>{value}</strong><small>{sub}</small>{to&&<span className="stat-nav-indicator" aria-hidden="true"><ArrowUpRight size={17}/></span>}</>;
  return to
    ? <Link className={`stat-card stat-${tone} stat-navigate`} to={to} aria-label={`View ${label.toLowerCase()}: ${value}`}>{contents}</Link>
    : <div className={`stat-card stat-${tone}`}>{contents}</div>;
}
const upcoming=(list)=>list.filter(x=>x.event_date>=localToday()).sort((a,b)=>(a.event_date+a.event_time).localeCompare(b.event_date+b.event_time));

/* Original, lightweight SVG characters. No external image service or family photos required. */
function FamilyAvatar({member,index=0}){
  const tones=['#FFE4C9','#F1C3A5','#E1B092','#F6D4BD','#DFA47F'];
  const shirts=['#4D9F96','#A78CD2','#E79E83','#DDA65F','#5687BF'];
  const hairs=['#283B38','#53372E','#263A56','#654532','#2B302E'];
  const backgrounds=['#DFF5F1','#F1E9FF','#FFF0E6','#F8F4DC','#E5EEFF'];
  const k=Math.abs(Number(member?.id)||index+1)%5;
  const hair=k===0?<path d="M22 35Q19 9 42 12Q68 10 67 36L63 37Q55 22 43 23Q32 23 27 37Z" fill={hairs[k]}/>
    :k===1?<><path d="M23 37Q14 18 31 12Q43 3 55 13Q71 17 64 40L59 39Q63 25 49 23Q35 14 28 39Z" fill={hairs[k]}/><circle cx="22" cy="28" r="9" fill={hairs[k]}/><circle cx="65" cy="28" r="9" fill={hairs[k]}/></>
    :k===2?<path d="M22 38Q17 17 32 14Q54 5 66 25Q60 20 54 22Q40 35 25 33Z" fill={hairs[k]}/>
    :k===3?<><path d="M23 38Q17 8 44 12Q68 8 66 38L60 35Q54 26 48 23Q34 29 27 37Z" fill={hairs[k]}/><circle cx="62" cy="17" r="10" fill={hairs[k]}/></>
    :<path d="M24 38Q17 22 31 14Q43 6 58 17Q67 21 65 36L58 32Q51 22 38 27L28 39Z" fill={hairs[k]}/>;
  return <svg className="family-illustrated-avatar" viewBox="0 0 88 88" role="img" aria-label={`Illustrated avatar for ${member?.name||'household member'}`}>
    <circle cx="44" cy="44" r="43" fill={backgrounds[k]}/>
    <path d="M12 88Q15 65 33 65L55 65Q75 67 77 88Z" fill={shirts[k]}/>
    <path d="M39 56H49V68Q44 73 39 68Z" fill={tones[k]}/>
    <ellipse cx="44" cy="39" rx="19" ry="24" fill={tones[k]}/>
    <ellipse cx="25" cy="43" rx="4" ry="7" fill={tones[k]}/><ellipse cx="63" cy="43" rx="4" ry="7" fill={tones[k]}/>
    {hair}
    <path d="M35 42Q38 40 40 42M49 42Q52 40 54 42" stroke="#37423C" strokeWidth="2.3" strokeLinecap="round" fill="none"/>
    <path d="M40 53Q44 56 49 52" stroke="#9C5148" strokeWidth="1.9" strokeLinecap="round" fill="none"/>
    {k===1&&<><path d="M31 43Q36 48 41 43M47 43Q52 48 57 43" fill="none" stroke="#74576A" strokeWidth="1.6"/></>}
    {k===3&&<path d="M59 19l7-9 7 7-9 7Z" fill="#E893A7"/>}
  </svg>;
}
function MorningCharacter(){return <img className="morning-character" src={heroWaveAvatar} alt="Friendly illustrated avatar waving beside a home window"/>}


/* Reference-style Sun Hours: gray shoulders, colorful daylight arc and live marker. */
const sunArcPoint=(p)=>({x:12+196*p,y:108-88*Math.pow(Math.sin(Math.PI*p),1.6)});
const sunArcPath=(from,to)=>Array.from({length:61},(_,i)=>{
  const point=sunArcPoint(from+(to-from)*i/60);
  return `${i?'L':'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}).join(' ');
const longDaylight=(minutes)=>{
  const value=Math.round(minutes);
  return `${Math.floor(value/60)}hrs ${value%60}mins`;
};

function HomeWelcome({user,members,sunLocation}){
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const handle=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(handle)},[]);
  const hour=Math.floor(manilaClock(now).minutes/60);
  const period=hour<12?'morning':hour<17?'afternoon':'evening';
  const periodIcon=hour<17?<Sun size={17}/>:<Moon size={17}/>;
  const list=members.length?members:[user];
  const first=(user.name||'there').trim().split(/\s+/)[0];
  const shown=list.slice(0,4);
  const cityTime=manilaClock(now);
  const solar=sunLocation?getSunHours(now,sunLocation.lat,sunLocation.lng):null;
  const sunProgress=solar?Math.max(0,Math.min(1,(cityTime.minutes-solar.sunrise)/solar.daylight)):0;
  return <section className="home-welcome-grid" aria-label="Your household welcome and family members">
    <article className="home-greeting-card">
      <div className="home-greeting-copy"><span className="home-greeting-kicker">{periodIcon} YOUR FAMILY, YOUR HAPPY PLACE</span><h2>Good {period},<br/><em>{first}!</em> <span aria-hidden="true">👋</span></h2><p>Welcome home. Here's to all the little moments that make your day special.</p><div className="home-greeting-footer"><span className="home-live-time"><Clock3 size={18}/>{now.toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'})}</span><Link to="/calendar" className="home-greeting-link">Family calendar <ArrowUpRight size={16}/></Link></div></div>
      <MorningCharacter/>
    </article>

<article className="home-date-card home-sun-section" aria-label="Sun hours for your household city">
  <div className="sun-ref-card">
    <div className="sun-ref-header">
      <h2>Sun hours</h2>
      <Link to="/settings#sun-location" className="sun-ref-settings" title="Change Sun Hours city" aria-label="Change Sun Hours city"><Settings2 size={16}/></Link>
    </div>
    {solar ? <>
      <div className="sun-ref-graph">
        <svg className="sun-ref-svg" viewBox="0 0 220 139" role="img" aria-label={`${longDaylight(solar.daylight)} of daylight in ${sunLocation.name}. Sunrise ${formatSunTime(solar.sunrise)}, sunset ${formatSunTime(solar.sunset)}.`}>
          <defs>
            <linearGradient id="sun-ref-spectrum" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#E66A64"/>
              <stop offset="43%" stopColor="#CF404D"/>
              <stop offset="72%" stopColor="#B3345D"/>
              <stop offset="100%" stopColor="#793C77"/>
            </linearGradient>
          </defs>
          <line x1="12" y1="89" x2="208" y2="89" className="sun-ref-horizon"/>
          <path d={sunArcPath(0,1)} className="sun-ref-track"/>
          <path d={sunArcPath(.28,.72)} stroke="url(#sun-ref-spectrum)" className="sun-ref-colored"/>
          <circle cx={sunArcPoint(.28).x} cy={sunArcPoint(.28).y} r="8.5" className="sun-ref-endpoint"/>
          <circle cx={sunArcPoint(.72).x} cy={sunArcPoint(.72).y} r="8.5" className="sun-ref-endpoint"/>
          {cityTime.minutes>=solar.sunrise && cityTime.minutes<=solar.sunset && <g transform={`translate(${sunArcPoint(sunProgress).x} ${sunArcPoint(sunProgress).y})`} className="sun-ref-current">
            <circle r="14" fill="#FFFFFF" opacity=".95"/>
            <circle r="5.6" fill="#DF4847"/>
            {Array.from({length:8},(_,i)=><line key={i} x1="0" y1="-9" x2="0" y2="-12" transform={`rotate(${i*45})`} stroke="#DF4847" strokeWidth="1.7" strokeLinecap="round"/>)}
          </g>}
          <text x="110" y="122" className="sun-ref-duration" textAnchor="middle">{longDaylight(solar.daylight)}</text>
        </svg>
      </div>
      <div className="sun-ref-times">
        <div className="sun-ref-time"><strong>{formatSunTime(solar.sunrise).split(' ')[0]}<span>{formatSunTime(solar.sunrise).split(' ')[1]}</span></strong><small>Sunrise</small></div>
        <div className="sun-ref-time"><strong>{formatSunTime(solar.sunset).split(' ')[0]}<span>{formatSunTime(solar.sunset).split(' ')[1]}</span></strong><small>Sunset</small></div>
      </div>
      <p className="sun-ref-location"><Sun size={12}/>{sunLocation.name} <span aria-hidden="true">·</span> {now.toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'})}</p>
    </> : <div className="sun-ref-unset"><Sun size={34}/><strong>Set your location</strong><span>Choose your household city to see sunrise and sunset times.</span><Link to="/settings#sun-location">Choose city <ArrowUpRight size={14}/></Link></div>}
  </div>
</article>
    <article className="home-family-card"><div className="home-family-heading"><div><span className="home-mini-heading"><Users size={17}/> THE PEOPLE WHO MATTER</span><h2>Our family</h2></div><span className="home-member-count">{list.length} {list.length===1?'member':'members'}</span></div><div className="home-member-grid">{shown.map((member,index)=><div className="home-member" key={member.id}><div className="home-member-art"><ProfileAvatar member={member} index={index}/></div><strong title={member.name}>{member.name.trim().split(/\s+/)[0]}</strong><span>{member.id===user.id?'You':'Member'}</span></div>)}{list.length===1&&<Link to="/settings" className="home-member home-member-add"><div className="home-member-art home-add-art"><UserPlus size={26}/></div><strong>Invite</strong><span>Family</span></Link>}</div><div className="home-family-footer"><span>{list.length===1?'Invite loved ones to join your space.':`${list.length} registered household ${list.length===1?'member':'members'}`}{list.length>4?` · +${list.length-4} more`:''}</span><Link to="/settings" aria-label="Go to Settings to invite family members"><UserPlus size={17}/> Invite</Link></div></article>
  </section>;
}

// Manual household inventory: recorded statuses only, never a remote device-control system.
const DEVICE_TYPES = [
  {value:'Refrigerator',image:'/appliances/refrigerator.png'},
  {value:'Air Conditioner',image:'/appliances/air-conditioner.png'},
  {value:'Washing Machine',image:'/appliances/washing-machine.png'},
  {value:'Television',image:'/appliances/television.png'},
  {value:'Electric Fan',image:'/appliances/electric-fan.png'},
  {value:'Lighting',image:'/appliances/lighting.png'},
  {value:'Other',image:'/appliances/other.png'}
];
const imageForDevice = kind => DEVICE_TYPES.find(type=>type.value===kind)?.image || '/appliances/other.png';

// A custom, accessible image picker.  The menu is portaled outside the scrollable
// modal to avoid clipping when the appliance field is near the bottom of the form.
function ApplianceTypePicker({value,onChange,disabled=false}){
  const [open,setOpen]=useState(false);
  const [menuPosition,setMenuPosition]=useState(null);
  const triggerRef=useRef(null);
  const menuRef=useRef(null);
  const itemRefs=useRef([]);
  const selectedIndex=Math.max(0,DEVICE_TYPES.findIndex(type=>type.value===value));
  const selected=DEVICE_TYPES[selectedIndex];

  useEffect(()=>{
    if(!open)return;
    const reposition=()=>{
      const r=triggerRef.current?.getBoundingClientRect();
      if(!r)return;
      const width=Math.max(r.width,230);
      const visibleHeight=Math.min(322,window.innerHeight-24);
      const below=window.innerHeight-r.bottom-10;
      const above=r.top-10;
      const up=below<Math.min(255,visibleHeight)&&above>below;
      setMenuPosition({
        top:up?Math.max(10,r.top-visibleHeight-8):Math.min(window.innerHeight-visibleHeight-10,r.bottom+8),
        left:Math.max(10,Math.min(r.left,window.innerWidth-width-10)),
        width:Math.min(width,window.innerWidth-20),
        maxHeight:visibleHeight
      });
    };
    const outside=e=>{
      if(!triggerRef.current?.contains(e.target)&&!menuRef.current?.contains(e.target))setOpen(false);
    };
    reposition();
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    document.addEventListener('pointerdown',outside);
    return()=>{
      window.removeEventListener('resize',reposition);
      window.removeEventListener('scroll',reposition,true);
      document.removeEventListener('pointerdown',outside);
    };
  },[open]);
  useEffect(()=>{
    if(open&&menuPosition){
      itemRefs.current[selectedIndex]?.focus({preventScroll:true});
      itemRefs.current[selectedIndex]?.scrollIntoView({block:'nearest'});
    }
  },[open,Boolean(menuPosition)]);
  const select=choice=>{
    onChange(choice);
    setOpen(false);
    triggerRef.current?.focus({preventScroll:true});
  };
  const keyboard=e=>{
    if(e.key==='Escape'){
      e.preventDefault();e.stopPropagation();setOpen(false);triggerRef.current?.focus();return;
    }
    const idx=itemRefs.current.findIndex(el=>el===document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?DEVICE_TYPES.length-1:
        (idx+(e.key==='ArrowDown'?1:-1)+DEVICE_TYPES.length)%DEVICE_TYPES.length;
      itemRefs.current[next]?.focus({preventScroll:true});
      itemRefs.current[next]?.scrollIntoView({block:'nearest'});
    }
  };
  return <div className="field device-type-field">
    <span id="device-type-caption">Appliance type</span>
    <button ref={triggerRef} type="button" disabled={disabled}
      className={`device-type-trigger${open?' is-open':''}`}
      aria-labelledby="device-type-caption device-type-value"
      aria-haspopup="listbox" aria-expanded={open}
      onClick={()=>{setMenuPosition(null);setOpen(v=>!v)}}
      onKeyDown={e=>{
        if(!open&&['ArrowDown','ArrowUp',' '].includes(e.key)){
          e.preventDefault();setMenuPosition(null);setOpen(true);
        }
        if(open&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false)}
      }}>
      <img src={selected.image} alt="" loading="lazy" className="device-type-thumb"/>
      <span id="device-type-value" className="device-type-value">{selected.value}</span>
      <ChevronRight size={16} className={`device-type-chevron${open?' is-open':''}`} aria-hidden="true"/>
    </button>
    {open&&menuPosition&&createPortal(
      <div ref={menuRef} className="device-type-menu" role="listbox" aria-label="Appliance type"
        style={menuPosition} onKeyDown={keyboard}>
        {DEVICE_TYPES.map((type,i)=><button type="button" role="option"
          ref={el=>{itemRefs.current[i]=el}}
          aria-selected={type.value===value}
          className={`device-type-option${type.value===value?' selected':''}`}
          key={type.value} onClick={()=>select(type.value)}>
          <span className="device-type-option-image"><img src={type.image} alt="" loading="lazy"/></span>
          <span className="device-type-option-name">{type.value}</span>
          {type.value===value&&<Check size={17} aria-hidden="true" className="device-type-check"/>}
        </button>)}
      </div>,document.body)}
  </div>;
}
const initialDevice = {name:'',room:'',kind:'Refrigerator',status:'unknown'};

function HouseholdDevices(){
  const {data,run}=useApp();
  const devices=data.devices||[];
  const [expanded,setExpanded]=useState(false);
  const [formOpen,setFormOpen]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [draft,setDraft]=useState(initialDevice);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [busy,setBusy]=useState(false);
  const visible=expanded?devices:devices.slice(0,4);
  const countOn=devices.filter(d=>d.status==='on').length;
  const countOff=devices.filter(d=>d.status==='off').length;
  const addDevice=()=>{setEditingId(null);setDraft({...initialDevice});setFormOpen(true)};
  const editDevice=device=>{setEditingId(device.id);setDraft({name:device.name,room:device.room,kind:device.kind,status:device.status});setFormOpen(true)};
  const save=async e=>{
    e.preventDefault();
    if(!draft.name.trim()||!draft.room.trim())return;
    setBusy(true);
    try{
      await run(editingId?`/devices/${editingId}`:'/devices',editingId?'PATCH':'POST',
        {...draft,name:draft.name.trim(),room:draft.room.trim()},
        editingId?'Household device updated.':'Household device added.');
      setFormOpen(false);
    }catch{}finally{setBusy(false)}
  };
  const recordStatus=async device=>{
    setBusy(true);
    try{await run(`/devices/${device.id}/status`,'PATCH',
      {status:device.status==='on'?'off':'on'},
      `Recorded status updated for ${device.name}.`)}catch{}finally{setBusy(false)}
  };
  const remove=async()=>{
    if(!deleteTarget)return;
    setBusy(true);
    try{await run(`/devices/${deleteTarget.id}`,'DELETE',undefined,'Household device removed.');setDeleteTarget(null)}catch{}finally{setBusy(false)}
  };
  return <section className="device-section" aria-labelledby="device-heading">
    <div className="device-section-heading">
      <div className="device-heading-copy">
        <span className="device-eyebrow"><Power size={15}/> YOUR HOME, AT A GLANCE</span>
        <h2 id="device-heading">Household devices</h2>
        <p>A thoughtful little space for the appliances that keep your home running.</p>
      </div>
      <div className="device-heading-actions">
        <div className="device-overview-counter" role="status" aria-label={`${countOn} recorded on, ${countOff} recorded off, ${devices.length-countOn-countOff} not checked`}>
          <span className="device-count-item device-count-on"><i aria-hidden="true"/>{countOn} <small>On</small></span>
          <span className="device-count-divider" aria-hidden="true"/>
          <span className="device-count-item device-count-off"><i aria-hidden="true"/>{countOff} <small>Off</small></span>
          <span className="device-count-divider" aria-hidden="true"/>
          <span className="device-count-item device-count-unknown"><i aria-hidden="true"/>{devices.length-countOn-countOff} <small>Unchecked</small></span>
        </div>
        <Button icon={Plus} onClick={addDevice}>Add device</Button>
      </div>
    </div>
    {devices.length>0?<>
      <div className="device-card-grid">
        {visible.map(device=>{
          const image=imageForDevice(device.kind);
          const statusLabel=device.status==='on'?'Recorded on':device.status==='off'?'Recorded off':'Not checked';
          const lastUpdated=device.updated_at?new Date(device.updated_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):null;
          return <article className={`device-card device-card-${device.status}`} key={device.id}>
            <div className="device-card-top">
              <div className="device-card-icon device-card-icon-realistic" aria-hidden="true"><img src={image} alt="" loading="lazy" decoding="async"/></div>
              <span className={`device-status device-status-${device.status}`}><span className="device-status-dot"/>{statusLabel}</span>
            </div>
            <div className="device-card-copy">
              <span className="device-card-room"><House size={13} aria-hidden="true"/>{device.room}</span>
              <h3 title={device.name}>{device.name}</h3>
              <p>{device.kind}</p>
            </div>
            <div className="device-card-bottom">
              <div className="device-record-info"><Clock3 size={15} aria-hidden="true"/><div><span>LAST RECORDED</span><strong>{lastUpdated||'No update yet'}</strong></div></div>
              <div className="device-card-controls">
                <button type="button" className="device-record-btn" onClick={()=>recordStatus(device)} disabled={busy} aria-label={`Record ${device.name} as ${device.status==='on'?'off':'on'}. Does not control the physical device.`}><Power size={16} aria-hidden="true"/>{device.status==='on'?'Record as off':'Record as on'}</button>
                <button type="button" className="device-text-action" onClick={()=>editDevice(device)} disabled={busy} aria-label={`Edit ${device.name}`} title={`Edit ${device.name}`}><Pencil size={17}/></button>
                <button type="button" className="device-delete-btn" onClick={()=>setDeleteTarget(device)} disabled={busy} aria-label={`Remove ${device.name}`} title={`Remove ${device.name}`}><Trash2 size={17}/></button>
              </div>
            </div>
          </article>
        })}
      </div>
      {devices.length>4&&<div className="device-show-all"><button type="button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?'Show fewer devices':`View all ${devices.length} devices`} <ChevronRight size={16} className={expanded?'device-up':''}/></button></div>}
    </>:<div className="device-empty"><div className="device-empty-icon"><Plug size={27}/></div><div><h3>No household devices added yet</h3><p>Add your refrigerator, electric fan, or other appliances to start keeping track.</p></div><Button variant="outline" icon={Plus} onClick={addDevice}>Add first device</Button></div>}
    <p className="device-disclaimer"><Info size={16}/> Statuses are recorded manually. Haven Home does not monitor or physically control appliances.</p>
    {formOpen&&<Modal title={editingId?'Edit household device':'Add a household device'} subtitle="Save its details and manually recorded status. This does not connect to a physical device." close={()=>!busy&&setFormOpen(false)}>
      <form className="stack-fields" onSubmit={save}>
        <Field label="Device name" placeholder="e.g. Kitchen refrigerator" maxLength={100} required value={draft.name} onChange={e=>setDraft(x=>({...x,name:e.target.value}))}/>
        <div className="two-fields">
          <Field label="Room or location" placeholder="e.g. Kitchen" maxLength={80} required value={draft.room} onChange={e=>setDraft(x=>({...x,room:e.target.value}))}/>
          <ApplianceTypePicker value={draft.kind} disabled={busy} onChange={kind=>setDraft(x=>({...x,kind}))}/>
        </div>
        <Field label="Manually recorded status" as="select" value={draft.status} onChange={e=>setDraft(x=>({...x,status:e.target.value}))}><option value="unknown">Not checked</option><option value="on">On (recorded)</option><option value="off">Off (recorded)</option></Field>
        <p className="device-form-explainer"><Info size={16}/> A recorded status may become outdated. Never rely on it to confirm that an appliance is physically off.</p>
        <div className="form-buttons"><Button variant="outline" type="button" onClick={()=>setFormOpen(false)} disabled={busy}>Cancel</Button><Button icon={Save} type="submit" loading={busy}>{editingId?'Save changes':'Add device'}</Button></div>
      </form>
    </Modal>}
    {deleteTarget&&<Modal title={`Remove ${deleteTarget.name}?`} subtitle="This removes the device record from your household. It will not change the physical appliance." close={()=>!busy&&setDeleteTarget(null)}>
      <div className="form-buttons"><Button variant="outline" onClick={()=>setDeleteTarget(null)} disabled={busy}>Cancel</Button><Button variant="danger" icon={Trash2} loading={busy} onClick={remove}>Remove device</Button></div>
    </Modal>}
  </section>;
}

function Dashboard(){const {data,run}=useApp();const {reminders,bills,announcements}=data;const tasks=data.tasks||[];const activeTasks=tasks.filter(t=>t.status!=='completed').sort((a,b)=>a.due_date.localeCompare(b.due_date));const completedTasks=tasks.filter(t=>t.status==='completed');const next=upcoming(reminders);const unpaid=bills.filter(b=>b.status==='unpaid');return <><PageHeader eyebrow="YOUR FAMILY, ONE PLACE" title="Home Dashboard" description="A little more connected, a lot more organized." actions={<Link className="btn btn-primary" to="/calendar/new"><Plus size={17}/> Add reminder</Link>}/><HomeWelcome user={data.user} members={data.members||[data.user]} sunLocation={data.sun_location}/><HouseholdDevices/><div className="stats-grid"><StatCard to="/calendar?focus=upcoming#calendar-overview" label="Upcoming events" value={next.length} sub="Scheduled from today" icon={CalendarDays} tone="green"/><StatCard to="/expenses?status=unpaid#household-bills" label="Unpaid bills" value={unpaid.length} sub={php(unpaid.reduce((n,x)=>n+x.amount,0))+' remaining'} icon={ReceiptText} tone="rose"/><StatCard to="/tasks?view=all#family-chore-board" label="Open chores" value={activeTasks.length} sub={`${completedTasks.length} completed household tasks`} icon={ListTodo} tone="gold"/><StatCard to="/household#household-announcements" label="Announcements" value={announcements.length} sub="Updates shared with family" icon={Megaphone} tone="purple"/></div><div className="dashboard-grid"><Panel title="Coming up" subtitle="Your household's next plans" action={<Link className="text-link" to="/calendar">View calendar <ArrowUpRight size={15}/></Link>}>{next.length?<div className="event-list">{next.slice(0,4).map(r=><Link to={`/calendar/${r.id}`} key={r.id} className="event-row"><div className="date-tile"><strong>{dateFrom(r.event_date).getDate()}</strong><span>{niceDate(r.event_date,{month:'short'})}</span></div><div className="event-copy"><strong>{displayRecordText(r.title,r.is_demo,'Event')}</strong><span><Clock3 size={14}/> {eTime(r.event_time)} · {r.category}</span></div><ChevronRight size={18}/></Link>)}</div>:<Empty icon={CalendarDays} title="A clear calendar ahead" description="Add your first family reminder to see it here." action={<Link className="btn btn-outline" to="/calendar/new"><Plus size={16}/> Add reminder</Link>}/>}</Panel><Panel title="Bills to remember" subtitle="Keep household payments on track" action={<Link className="text-link" to="/expenses">View expenses <ArrowUpRight size={15}/></Link>}>{unpaid.length?<div className="bill-list-mini">{unpaid.slice(0,4).map(b=><Link className="bill-mini" to={`/expenses/${b.id}`} key={b.id}><div className="bill-mini-icon"><CreditCard size={19}/></div><div><strong>{displayRecordText(b.title,b.is_demo,'Bill')}</strong><span>Due {niceDate(b.due_date)}</span></div><strong className="bill-mini-price">{php(b.amount)}</strong></Link>)}</div>:<Empty icon={CheckCircle2} title="No unpaid bills" description="Add a household bill to start tracking your expenses." action={<Link to="/expenses" className="btn btn-outline">Go to expenses</Link>}/>}</Panel><Panel title="Household announcements" subtitle="The latest notes for everyone" action={<Link className="text-link" to="/household">All updates <ArrowUpRight size={15}/></Link>}>{announcements.length?<div className="announcement-preview"><div className="announcement-art"><Megaphone size={22}/></div><div><div className="preview-small">LATEST ANNOUNCEMENT</div><strong>{displayRecordText(announcements[0].title,announcements[0].is_demo,'Announcement')}</strong><p>{displayRecordText(announcements[0].content,announcements[0].is_demo)}</p><Link to="/household" className="text-link">Read updates <ArrowUpRight size={15}/></Link></div></div>:<Empty icon={Megaphone} title="No announcements yet" description="Post an update for everyone in the household." action={<Link to="/household" className="btn btn-outline">Household info</Link>}/>}</Panel><Panel title="Tasks & chores" subtitle="The next responsibilities around your home" action={<Link className="text-link" to="/tasks">Open chore board <ArrowUpRight size={15}/></Link>}>
  {activeTasks.length?<div className="chores-dashboard-list">{activeTasks.slice(0,4).map(task=><Link to="/tasks" className="chores-dashboard-link" key={task.id}>
    <div><span className="chores-dashboard-icon"><ListTodo size={18}/></span><span><strong>{task.title}</strong><small>Due {niceDate(task.due_date)} · {task.assigned_to ? (data.members||[]).find(m=>m.id===task.assigned_to)?.name||'Family member':'Unassigned'}</small></span></div><ChevronRight size={17}/>
  </Link>)}</div>:<Empty icon={ListTodo} title="Your chore board is clear" description="Add a family responsibility to help everyone stay organized." action={<Link className="btn btn-outline" to="/tasks"><Plus size={16}/> Go to chores</Link>}/>}</Panel></div><MonthlyBillsChart bills={bills} compact/></>}

function Sparkline({data,width=320,height=140}){if(!data?.length)return null;const min=Math.min(...data),max=Math.max(...data),range=Math.max(max-min,1),padding=10;const pts=data.map((n,i)=>[(i/(Math.max(data.length-1,1)))*(width-2*padding)+padding,height-padding-((n-min)/range)*(height-padding*3)]);const line=pts.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ');const fill=line+` L${pts.at(-1)[0]},${height} L${pts[0][0]},${height} Z`;return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Usage trend: ${data.map(Math.round).join(', ')} kilowatt hours`}><defs><linearGradient id="sparka" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#64a78a" stopOpacity=".3"/><stop offset="1" stopColor="#64a78a" stopOpacity="0"/></linearGradient></defs><path d={fill} fill="url(#sparka)"/><path d={line} stroke="#43876c" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{pts.length===1&&<circle cx={pts[0][0]} cy={pts[0][1]} r="4" fill="#43876c"/>}</svg>}

function Calendar(){const {data}=useApp();const nav=useNavigate();const loc=useLocation();const nearest= new URLSearchParams(loc.search).get('focus')==='upcoming' ? upcoming(data.reminders)[0]?.event_date : null;const [month,setMonth]=useState((nearest||localToday()).slice(0,7));const [selected,setSelected]=useState(nearest||localToday());const [view,setView]=useState('month');const [yr,mo]=month.split('-').map(Number);const start=new Date(yr,mo-1,1);const days=new Date(yr,mo,0).getDate();const off=(start.getDay()+6)%7;const grid=Array.from({length:Math.ceil((off+days)/7)*7},(_,i)=>i-off+1);const shift=n=>{const d=new Date(yr,mo-1+n,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)};const byDate=useMemo(()=>{const grouped=new Map();for(const reminder of data.reminders){if(!grouped.has(reminder.event_date))grouped.set(reminder.event_date,[]);grouped.get(reminder.event_date).push(reminder)}for(const items of grouped.values())items.sort((a,b)=>(a.event_time||'').localeCompare(b.event_time||''));return grouped},[data.reminders]);const list=byDate.get(selected)||[];const monthEventCount=data.reminders.filter(r=>r.event_date?.startsWith(month+'-')).length;return <><PageHero variant="calendar" eyebrow="PLAN THE DAYS AHEAD" title="Family Calendar" description="All the dates and little moments your household cares about." actions={<Link to="/calendar/new" className="btn btn-primary"><Plus size={17}/> Add reminder</Link>} visualValue={Number(localToday().slice(-2))} visualLabel={niceDate(localToday(),{month:'short',year:'numeric'})} metrics={[{label:'Events this month',value:monthEventCount},{label:'Still ahead',value:upcoming(data.reminders).length}]} visualNote="Make room for more moments together." footer="Your plans, all in one place"/><div className="calendar-layout"><section id="calendar-overview" className="panel calendar-panel"><div className="calendar-toolbar"><div className="calendar-month"><div className="cal-month-heading"><h2>{new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric'}).format(start)}</h2><p>{monthEventCount} {monthEventCount===1?'scheduled event':'scheduled events'} this month</p></div><div className="calendar-nav"><IconButton icon={ChevronLeft} label="Previous month" onClick={()=>shift(-1)}/><button className="today-button" onClick={()=>{setMonth(localToday().slice(0,7));setSelected(localToday())}}>Today</button><IconButton icon={ChevronRight} label="Next month" onClick={()=>shift(1)}/></div></div></div><div className="cal-grid cal-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}</div><div className="cal-grid cal-days">{grid.map((d,i)=>{const day=d>=1&&d<=days?`${month}-${String(d).padStart(2,'0')}`:null;const events=day?(byDate.get(day)||[]):[];return <button key={i} type="button" className={`cal-day ${!day?'cal-blank':''} ${day===selected?'cal-selected':''} ${day===localToday()?'cal-today':''} ${events.length?'cal-has-events':''}`} disabled={!day} aria-pressed={day?day===selected:undefined} aria-label={day?`${niceDate(day,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}: ${events.length} ${events.length===1?'event':'events'}${events.length?'. '+events.map(e=>`${eTime(e.event_time)} ${displayRecordText(e.title,e.is_demo,'Event')}`).join('; '):''}`:undefined} onClick={()=>day&&setSelected(day)}><span className="cal-date">{day?d:''}</span>{events.length>0&&<><span className="cal-day-count" aria-hidden="true">{events.length}</span><span className="cal-event-preview" aria-hidden="true">{events.slice(0,2).map(e=><span key={e.id} className={`cal-event-chip cal-event-${badgeColor(e.category)}`} title={`${eTime(e.event_time)} · ${displayRecordText(e.title,e.is_demo,'Event')}`}><span className="cal-event-chip-time">{eTime(e.event_time)}</span><span className="cal-event-chip-title">{displayRecordText(e.title,e.is_demo,'Event')}</span></span>)}{events.length>2&&<span className="cal-event-more">+{events.length-2} more</span>}</span><span className="cal-mobile-event-summary" aria-hidden="true">{events.length} {events.length===1?'event':'events'}</span></>}</button>})}</div><div className="calendar-legend"><span><i className="legend-circle"/> Today</span><span><i className="legend-circle selected"/> Selected day</span><span><i className="legend-circle event"/> Event preview (select a date for details)</span></div></section><aside className="calendar-right"><Panel title="Selected day" subtitle={niceDate(selected,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}>{list.length?<div className="day-event-list">{list.map(r=><Link to={`/calendar/${r.id}`} className="day-event" key={r.id}><span className="day-event-time">{eTime(r.event_time)}</span><strong>{displayRecordText(r.title,r.is_demo,'Event')}</strong><Pill color={badgeColor(r.category)}>{r.category}</Pill></Link>)}</div>:<Empty icon={CalendarDays} title="No plans this day" description="This date is open. Add a reminder for your family." action={<Link to={`/calendar/new?date=${selected}`} className="btn btn-outline"><Plus size={16}/> Add here</Link>}/>}</Panel><div className="tip-card"><CalendarCheck size={22}/><strong>Make plans together.</strong><p>Reminders you add here appear for everyone in your household.</p></div></aside></div></>}
function ReminderForm(){const {run}=useApp();const nav=useNavigate();const query=new URLSearchParams(useLocation().search);const [form,setForm]=useState({title:'',event_date:query.get('date')||localToday(),event_time:'09:00',category:'Family',description:''});const [saving,setSaving]=useState(false);const change=e=>setForm(p=>({...p,[e.target.name]:e.target.value}));const submit=async e=>{e.preventDefault();setSaving(true);try{const x=await run('/reminders','POST',form,'Reminder saved. Your family calendar and dashboard are updated.');nav(`/calendar/${x.id}`)}catch{}finally{setSaving(false)}};return <><Link to="/calendar" className="back-link"><ArrowLeft size={17}/> Back to calendar</Link><PageHeader eyebrow="FAMILY CALENDAR / NEW REMINDER" title="Add a family reminder" description="Keep everyone in the loop about what's coming up."/><div className="form-layout"><form onSubmit={submit} className="panel edit-panel"><div className="form-section-title"><CalendarPlus size={20}/><div><h2>Reminder details</h2><p>Tell your household about the event.</p></div></div><Field label="Reminder title *" name="title" value={form.title} onChange={change} placeholder="e.g. Family dinner, dentist appointment" required maxLength={120}/><div className="two-fields"><Field label="Date *" name="event_date" type="date" value={form.event_date} onChange={change} required/><Field label="Time *" name="event_time" type="time" value={form.event_time} onChange={change} required/></div><Field label="Category" as="select" name="category" value={form.category} onChange={change}>{['Family','School','Health','Other'].map(c=><option key={c}>{c}</option>)}</Field><Field label="Description (optional)" as="textarea" rows={5} name="description" value={form.description} onChange={change} placeholder="Any extra details your family should know?" maxLength={1500}/><div className="form-buttons"><Button type="button" variant="outline" onClick={()=>nav('/calendar')}>Cancel</Button><Button type="submit" loading={saving} icon={Save}>Save reminder</Button></div></form><aside className="form-side-note"><div className="note-icon"><Bell size={21}/></div><h3>A gentle reminder</h3><p>Saved events appear on the family calendar and in the dashboard's upcoming plans. Every household member can see them.</p><div className="note-divider"/><p><ShieldCheck size={16}/> Visible only to people in your household.</p></aside></div></>}
function ReminderDetail(){const {id}=useParams();const {data,run}=useApp();const nav=useNavigate();const item=data.reminders.find(x=>x.id===Number(id));const [confirm,setConfirm]=useState(false),[editing,setEditing]=useState(false),[form,setForm]=useState(null),[busy,setBusy]=useState(false);if(!item)return <NotFound to="/calendar"/>;const begin=()=>{setForm({title:item.title,event_date:item.event_date,event_time:item.event_time,category:item.category,description:item.description});setEditing(true)};const change=e=>setForm(x=>({...x,[e.target.name]:e.target.value}));const update=async e=>{e.preventDefault();setBusy(true);try{await run(`/reminders/${id}`,'PATCH',form,'Reminder updated successfully.');setEditing(false)}catch{}finally{setBusy(false)}};const remove=async()=>{setBusy(true);try{await run(`/reminders/${id}`,'DELETE',undefined,'Reminder removed from the household calendar.');nav('/calendar')}catch{}finally{setBusy(false);setConfirm(false)}};return <><Link className="back-link" to="/calendar"><ArrowLeft size={17}/> Back to calendar</Link><PageHeader eyebrow="FAMILY CALENDAR / EVENT DETAILS" title={displayRecordText(item.title,item.is_demo,'Event')} description="Everything you need to know about this family reminder." actions={<><Button variant="outline" icon={Pencil} onClick={begin}>Edit</Button><Button variant="danger-outline" icon={Trash2} onClick={()=>setConfirm(true)}>Delete</Button></>}/><section className="panel detail-panel"><Pill color={badgeColor(item.category)}>{item.category}</Pill><div className="detail-info-grid"><div><CalendarDays size={20}/><span>Scheduled date</span><strong>{niceDate(item.event_date,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</strong></div><div><Clock3 size={20}/><span>Event time</span><strong>{eTime(item.event_time)}</strong></div></div><h3>Details</h3><p className="detail-description">{displayRecordText(item.description,item.is_demo)||'No additional details were provided for this reminder.'}</p><Link className="btn btn-outline" to="/dashboard"><House size={16}/> Return to dashboard</Link></section>{confirm&&<Modal title="Delete this reminder?" subtitle="This will remove the reminder for everyone in the household." close={()=>setConfirm(false)}><div className="form-buttons"><Button variant="outline" onClick={()=>setConfirm(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={remove}>Delete reminder</Button></div></Modal>}{editing&&<Modal title="Edit family reminder" close={()=>setEditing(false)}><form className="stack-fields" onSubmit={update}><Field label="Title" value={form.title} name="title" onChange={change} required/><div className="two-fields"><Field label="Date" type="date" value={form.event_date} name="event_date" onChange={change} required/><Field label="Time" type="time" value={form.event_time} name="event_time" onChange={change} required/></div><Field label="Category" as="select" name="category" value={form.category} onChange={change}>{['Family','School','Health','Other'].map(c=><option key={c}>{c}</option>)}</Field><Field label="Description" as="textarea" name="description" rows={3} value={form.description} onChange={change}/><div className="form-buttons"><Button variant="outline" type="button" onClick={()=>setEditing(false)}>Cancel</Button><Button type="submit" icon={Save} loading={busy}>Save changes</Button></div></form></Modal>}</>}
function NotFound({to}){return <Empty icon={Search} title="We couldn't find that item" description="It may have been removed or the link is no longer valid." action={<Link to={to} className="btn btn-outline">Go back</Link>}/>}

function Household(){const {data,run}=useApp();const [modal,setModal]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(null);const [announcement,setAnnouncement]=useState({title:'',content:''}),[contact,setContact]=useState({name:'',relation:'Family',phone:''});const save=async e=>{e.preventDefault();setBusy(true);try{if(modal==='announcement'){await run('/announcements','POST',announcement,'Your announcement was shared with the household.');setAnnouncement({title:'',content:''})}else{await run('/contacts','POST',contact,'Contact added successfully.');setContact({name:'',relation:'Family',phone:''})}setModal('')}catch{}finally{setBusy(false)}};const del=async()=>{setBusy(true);try{await run(`/${confirm.type}/${confirm.id}`,'DELETE',undefined,'Item removed.');setConfirm(null)}catch{}finally{setBusy(false)}};return <><PageHero variant="household" eyebrow="STAY CONNECTED" title="Household Information" description="Important notes and helpful contacts, all in one spot." actions={<a className="btn btn-primary" href="#household-announcements"><Megaphone size={17}/> View family updates</a>} visualValue={(data.members||[]).length||1} visualLabel="Family members" metrics={[{label:'Family updates',value:data.announcements.length},{label:'Important contacts',value:data.contacts.length}]} visualNote="Keep everyone close, wherever the day takes you." footer="One shared family space"/><div className="household-grid"><Panel id="household-announcements" title="Family announcements" subtitle="Shared updates everyone can see" action={<Button icon={Plus} onClick={()=>setModal('announcement')}>New announcement</Button>}><AnnouncementRecords records={data.announcements} displayText={displayRecordText} onAdd={()=>setModal('announcement')} onDelete={id=>setConfirm({type:'announcements',id})}/></Panel><Panel title="Important contacts" subtitle="Quickly find someone when you need them" action={<Button variant="outline" icon={Plus} onClick={()=>setModal('contact')}>Add contact</Button>}><ContactRecords records={data.contacts} displayText={displayRecordText} onAdd={()=>setModal('contact')} onDelete={id=>setConfirm({type:'contacts',id})}/></Panel></div>{modal&&<Modal title={modal==='announcement'?'Post an announcement':'Add a household contact'} subtitle={modal==='announcement'?'Visible to everyone in your family space.':'Keep important contact information easy to find.'} close={()=>setModal('')}><form className="stack-fields" onSubmit={save}>{modal==='announcement'?<><Field label="Announcement title" value={announcement.title} required maxLength={120} onChange={e=>setAnnouncement(x=>({...x,title:e.target.value}))} placeholder="e.g. Family meeting on Sunday"/><Field label="Message" as="textarea" rows={5} value={announcement.content} required onChange={e=>setAnnouncement(x=>({...x,content:e.target.value}))} placeholder="Write your household update here..."/></>:<><Field label="Contact name" value={contact.name} required onChange={e=>setContact(x=>({...x,name:e.target.value}))} placeholder="e.g. Mom"/><Field label="Relationship / label" value={contact.relation} onChange={e=>setContact(x=>({...x,relation:e.target.value}))}/><Field label="Phone number" value={contact.phone} required onChange={e=>setContact(x=>({...x,phone:e.target.value}))} placeholder="e.g. +63 9XX XXX XXXX"/></>}<div className="form-buttons"><Button variant="outline" type="button" onClick={()=>setModal('')}>Cancel</Button><Button loading={busy} type="submit" icon={Save}>{modal==='announcement'?'Publish':'Save contact'}</Button></div></form></Modal>}{confirm&&<Modal title="Remove this item?" subtitle="This change affects everyone in your household." close={()=>setConfirm(null)}><div className="form-buttons"><Button variant="outline" onClick={()=>setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={del} loading={busy}>Remove item</Button></div></Modal>}</>}

function TasksRoute(){const {data,run,changeTaskStatus}=useApp();return <HouseholdTasks tasks={data.tasks||[]} members={data.members||[]} currentUserId={data.user.id} isHouseholdOwner={data.user.is_household_owner === true} today={localToday()} onRun={run} onStatusChange={changeTaskStatus}/>;}
function Expenses(){const {data,run}=useApp();const loc=useLocation();const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[filter,setFilter]=useState(()=>new URLSearchParams(loc.search).get('status')==='unpaid'?'unpaid':'all'),[form,setForm]=useState({title:'',amount:'',due_date:localToday(),category:'Utilities',notes:''});const unpaid=data.bills.filter(x=>x.status==='unpaid');const paid=data.bills.filter(x=>x.status==='paid');const save=async e=>{e.preventDefault();setBusy(true);try{await run('/bills','POST',{...form,amount:Number(form.amount)},'Bill added. Everyone in your household can see it.');setOpen(false);setForm({title:'',amount:'',due_date:localToday(),category:'Utilities',notes:''})}catch{}finally{setBusy(false)}};return <><PageHero variant="expenses" eyebrow="STAY ON TOP OF THE DETAILS" title="Household Expenses" description="A clearer view of bills, due dates, and everyday expenses." actions={<Button icon={Plus} onClick={()=>setOpen(true)}>Add a bill</Button>} visualValue={unpaid.length} visualLabel="Unpaid bills" metrics={[{label:'Balance to track',value:php(unpaid.reduce((n,b)=>n+b.amount,0))},{label:'Recorded as paid',value:`${paid.length} bills`}]} visualNote="Keep bills organized. No payments are made here." footer="Simple tracking, more peace of mind"/><div className="stats-grid stats-three"><StatCard label="Outstanding balance" value={php(unpaid.reduce((n,x)=>n+x.amount,0))} sub={`${unpaid.length} unpaid bill${unpaid.length===1?'':'s'}`} icon={ReceiptText} tone="rose"/><StatCard label="Recorded as paid" value={php(paid.reduce((n,x)=>n+x.amount,0))} sub={`${paid.length} completed bill${paid.length===1?'':'s'}`} icon={CheckCircle2} tone="green"/><StatCard label="Total tracked" value={php(data.bills.reduce((n,x)=>n+x.amount,0))} sub="All household bill entries" icon={Wallet} tone="purple"/></div><MonthlyBillsChart bills={data.bills}/><ElectricityUsageSection records={data.energy||[]} run={run} formatAmount={php} formatMonth={niceDate} currentMonth={localToday().slice(0,7)}/><Panel id="household-bills" className="household-bills-panel" title="Household bills" subtitle="Search, scroll, and review bill payment records" action={<div className="filter-tabs" role="group" aria-label="Filter bill payment status">{['all','unpaid','paid'].map(x=><button type="button" key={x} aria-pressed={filter===x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>}><HouseholdBillsTable bills={data.bills} status={filter} onAdd={()=>setOpen(true)} formatAmount={php} formatDate={niceDate} displayText={displayRecordText} today={localToday()}/></Panel><div className="info-strip"><Info size={18}/> Marking a bill as paid updates your household record only. Haven does not transfer money or connect to banks.</div>{open&&<Modal title="Add a household bill" subtitle="Keep a record of your upcoming payment." close={()=>setOpen(false)}><form className="stack-fields" onSubmit={save}><Field label="Bill name" value={form.title} required maxLength={120} onChange={e=>setForm(x=>({...x,title:e.target.value}))} placeholder="e.g. Electricity bill"/><div className="two-fields"><Field label="Amount (₱)" type="number" min="0" step="0.01" value={form.amount} required onChange={e=>setForm(x=>({...x,amount:e.target.value}))}/><Field label="Due date" type="date" value={form.due_date} required onChange={e=>setForm(x=>({...x,due_date:e.target.value}))}/></div><Field label="Category" as="select" value={form.category} onChange={e=>setForm(x=>({...x,category:e.target.value}))}>{['Utilities','Groceries','Education','Internet','Other'].map(c=><option key={c}>{c}</option>)}</Field><Field label="Notes (optional)" as="textarea" rows={3} value={form.notes} onChange={e=>setForm(x=>({...x,notes:e.target.value}))}/><div className="form-buttons"><Button variant="outline" type="button" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" icon={Save} loading={busy}>Save bill</Button></div></form></Modal>}</>}
function BillDetail(){const {id}=useParams();const {data,run}=useApp();const nav=useNavigate();const b=data.bills.find(x=>x.id===Number(id));const [confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false);if(!b)return <NotFound to="/expenses"/>;const update=async()=>{setBusy(true);try{await run(`/bills/${id}/status`,'PATCH',{status:confirm},confirm==='paid'?'Bill marked as paid. The dashboard is updated.':'Bill marked as unpaid.');setConfirm('')}catch{}finally{setBusy(false)}};const remove=async()=>{setBusy(true);try{await run(`/bills/${id}`,'DELETE',undefined,'Bill deleted from your household.');nav('/expenses')}catch{}finally{setBusy(false)}};return <><Link to="/expenses" className="back-link"><ArrowLeft size={17}/> Back to household expenses</Link><PageHeader eyebrow="HOUSEHOLD EXPENSES / BILL DETAILS" title={displayRecordText(b.title,b.is_demo,'Bill')} description="Review this bill and keep its payment status up to date."/><div className="bill-detail-layout"><section className="panel bill-main"><div className="bill-detail-head"><div className="bill-hero-icon"><ReceiptText size={31}/></div><Pill color={b.status==='paid'?'green':'orange'}>{b.status==='paid'?'Paid':'Unpaid'}</Pill></div><span className="micro-label">RECORDED BILL AMOUNT</span><div className="bill-amount">{php(b.amount)}</div><div className="detail-info-grid"><div><CalendarDays size={19}/><span>Due date</span><strong>{niceDate(b.due_date)}</strong></div><div><Wallet size={19}/><span>Category</span><strong>{b.category}</strong></div></div><h3>Additional notes</h3><p className="detail-description">{displayRecordText(b.notes,b.is_demo)||'No additional notes for this bill.'}</p><div className="bill-actions">{b.status==='unpaid'?<Button icon={CheckCircle2} onClick={()=>setConfirm('paid')}>Mark as paid</Button>:<Button variant="outline" icon={RotateCcw} onClick={()=>setConfirm('unpaid')}>Mark as unpaid</Button>}<Button variant="danger-outline" icon={Trash2} onClick={()=>setConfirm('delete')}>Delete bill</Button></div></section><aside className="form-side-note"><div className="note-icon"><ShieldCheck size={23}/></div><h3>Just a record, not a payment.</h3><p>Changing the status only updates the shared expense tracker. It does not send funds, settle bills, or contact payment providers.</p><Link to="/dashboard" className="text-link"><House size={16}/> Back to dashboard</Link></aside></div>{confirm&&<Modal title={confirm==='delete'?'Delete this bill?':confirm==='paid'?'Mark this bill as paid?':'Mark this bill as unpaid?'} subtitle={confirm==='delete'?'This removes it from the shared household record.':confirm==='paid'?'Confirm only if the bill was actually paid outside this application.':'This bill will return to the unpaid list.'} close={()=>setConfirm('')}><div className="form-buttons"><Button variant="outline" onClick={()=>setConfirm('')}>Cancel</Button><Button variant={confirm==='delete'?'danger':'primary'} icon={confirm==='paid'?Check:undefined} loading={busy} onClick={confirm==='delete'?remove:update}>{confirm==='delete'?'Delete bill':'Confirm update'}</Button></div></Modal>}</>}

function PhotoCropDialog({image,onClose,onSaved}){
  const canvasRef=useRef(null);
  const dragRef=useRef(null);
  const [zoom,setZoom]=useState(1);
  const [offset,setOffset]=useState({x:0,y:0});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  // All movement is measured in a virtual 320px crop square regardless of screen width.
  const cover=Math.max(512/image.naturalWidth,512/image.naturalHeight);
  const limit=scale=>({
    x:Math.max(0,(image.naturalWidth*cover*scale-512)/2*320/512),
    y:Math.max(0,(image.naturalHeight*cover*scale-512)/2*320/512)
  });
  const clampPosition=(x,y,scale=zoom)=>{
    const bound=limit(scale);
    return {x:clamp(x,-bound.x,bound.x),y:clamp(y,-bound.y,bound.y)};
  };
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)return;
    ctx.clearRect(0,0,512,512);
    const scale=cover*zoom;
    const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    ctx.drawImage(image,(512-w)/2+offset.x*512/320,(512-h)/2+offset.y*512/320,w,h);
  },[image,zoom,offset,cover]);
  const beginDrag=e=>{if(busy)return;dragRef.current={x:e.clientX,y:e.clientY,offset};e.currentTarget.setPointerCapture(e.pointerId)};
  const moveDrag=e=>{
    if(!dragRef.current||busy)return;
    const rect=e.currentTarget.getBoundingClientRect();
    const factor=320/rect.width;
    setOffset(clampPosition(dragRef.current.offset.x+(e.clientX-dragRef.current.x)*factor,dragRef.current.offset.y+(e.clientY-dragRef.current.y)*factor));
  };
  const endDrag=e=>{dragRef.current=null;if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)};
  const changeZoom=n=>{const next=clamp(Number(n),1,3);setZoom(next);setOffset(pos=>clampPosition(pos.x,pos.y,next))};
  const keyboardMove=e=>{
    const step=e.shiftKey?20:6;
    const delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
    if(delta){e.preventDefault();setOffset(pos=>clampPosition(pos.x+delta[0],pos.y+delta[1]));}
  };
  const submit=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      const blob=await new Promise(resolve=>canvasRef.current?.toBlob(resolve,'image/jpeg',.87));
      if(!blob)throw Error('Could not prepare the cropped image. Try again.');
      const form=new FormData();form.append('photo',blob,'profile-photo.jpg');
      let response;
      try{response=await fetch('/api/profile/photo',{method:'PUT',credentials:'same-origin',headers:{'X-HIC-Action':'1'},body:form});}
      catch{throw Error('Could not reach Haven Home. Check your connection.');}
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(friendlyError(result));
      await onSaved();
    }catch(e){setError(e.message||'Photo upload failed.');}finally{setBusy(false)}
  };
  return <Modal title="Crop your profile photo" subtitle="Move the image to choose what appears inside the circle. Only the cropped 512 × 512 photo will be saved." close={()=>!busy&&onClose()}>
    <div className="profile-crop-layout">
      <div className="profile-crop-stage">
        <canvas ref={canvasRef} width={512} height={512} className="profile-crop-canvas" role="img" aria-label="Square crop preview. Drag to position photo, or use arrow keys." tabIndex={0}
          onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={keyboardMove}/>
        <span className="profile-crop-guide" aria-hidden="true"/>
      </div>
      <div className="profile-crop-sidebar">
        <div className="profile-crop-zoom-label"><ZoomOut size={17}/><label htmlFor="profile-crop-zoom">Zoom</label><ZoomIn size={17}/></div>
        <input id="profile-crop-zoom" type="range" min="1" max="3" step="0.02" value={zoom} onChange={e=>changeZoom(e.target.value)} disabled={busy}/>
        <span className="profile-crop-value">{Math.round(zoom*100)}%</span>
        <p>Drag the photo, use arrow keys for fine adjustments, or move the zoom slider. The circular guide shows your final avatar.</p>
        <button type="button" className="profile-crop-reset" onClick={()=>{setZoom(1);setOffset({x:0,y:0})}} disabled={busy}><RotateCcw size={15}/> Reset position</button>
      </div>
    </div>
    {error&&<p role="alert" className="profile-upload-error">{error}</p>}
    <div className="form-buttons profile-crop-actions"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button icon={Save} type="button" loading={busy} onClick={submit}>Save cropped photo</Button></div>
  </Modal>;
}

function AvatarPicker(){
  const {data,refresh,toast,selectAvatar,avatarSaving,resetAvatarSync}=useApp();
  const [saving,setSaving]=useState('');
  const [image,setImage]=useState(null);
  const [error,setError]=useState('');
  const fileInputRef=useRef(null);
  const isCustom=data.user.avatar_id==='custom'&&Boolean(data.user.photo_version);
  const selected=data.user.avatar_id||profileAvatarId(data.user);
  const choose=avatarId=>{
    if(saving||image||(!isCustom&&data.user.avatar_id===avatarId))return;
    setError('');
    selectAvatar(avatarId);
  };
  const selectFile=e=>{
    const file=e.target.files?.[0];
    e.target.value='';
    if(!file)return;
    setError('');
    if(file.size>10*1024*1024){setError('Choose an image of 10 MB or smaller.');return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Choose a JPG, PNG, or WebP image.');return;}
    const url=URL.createObjectURL(file);
    const img=new window.Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      if(img.naturalWidth*img.naturalHeight>80000000){setError('This image has too many pixels. Choose a smaller resolution.');return;}
      setImage(img);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);setError('The photo could not be opened. Please choose another image.');};
    img.src=url;
  };
  const savedPhoto=async()=>{resetAvatarSync();await refresh();toast('Your cropped profile photo has been saved.');setImage(null)};
  const remove=async()=>{
    if(saving||avatarSaving)return;
    setSaving('removing');setError('');
    try{
      await api('/profile/photo','DELETE');
      resetAvatarSync();
      await refresh();
      toast('Profile photo removed. Your default avatar is restored.');
    }catch(e){setError(e.message);toast(e.message,'error')}finally{setSaving('')}
  };
  return <section id="profile-avatar" className="panel avatar-picker-panel" aria-labelledby="avatar-picker-title">
    <div className="panel-top"><div><h2 id="avatar-picker-title">Your profile photo & icon</h2><p>Upload your own photo or choose one of the ten illustrated characters. Your choice appears to your family.</p></div></div>
    <div className="avatar-picker-preview"><div className="avatar-current-art"><ProfileAvatar member={data.user}/></div><div><strong>{data.user.name}</strong><span>{isCustom?'Your uploaded profile photo':'Your current profile icon'}</span></div></div>
    <div className="profile-upload-actions">
      <input className="profile-upload-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile picture to crop" ref={fileInputRef} onChange={selectFile}/>
      <Button type="button" variant="outline" icon={Camera} disabled={Boolean(saving)||avatarSaving||Boolean(image)} onClick={()=>fileInputRef.current?.click()}>{isCustom?'Change your photo':'Upload your photo'}</Button>
      {isCustom&&<Button type="button" variant="outline" icon={Trash2} disabled={Boolean(saving)||avatarSaving||Boolean(image)} onClick={remove}>Remove photo</Button>}
      <span className="profile-upload-limit"><ImageIcon size={16}/> JPG, PNG or WebP • Up to 10 MB • Crop before saving</span>
    </div>
    {error&&<p role="alert" className="profile-upload-error">{error}</p>}
    <div className="avatar-choices" role="group" aria-label="Select your profile icon">{PROFILE_AVATARS.map(a=>{
      const isSelected=!isCustom&&selected===a.id;
      return <button type="button" key={a.id} className={`avatar-choice ${isSelected?'selected':''}`} aria-label={`${a.label}${isSelected?', selected':''}`} aria-pressed={isSelected} disabled={Boolean(saving)||Boolean(image)} onClick={()=>choose(a.id)}>
        <img src={`/avatars/${a.id}.png`} alt="" loading="lazy"/><span>{a.label}</span>{isSelected&&<CheckCircle2 className="avatar-selected-check" size={20} aria-hidden="true"/>}
      </button>
    })}</div>
    <p className="setting-help"><Info size={16}/> {saving?'Saving your photo…':avatarSaving?'Your icon is applied. Saving in the background…':'Your photo is private to your household. Only you can upload or change it.'}</p>
    {image&&<PhotoCropDialog image={image} onClose={()=>setImage(null)} onSaved={savedPhoto}/>}
  </section>;
}

function HouseholdSunLocationPicker(){
  const {data,run}=useApp();
  const [selected,setSelected]=useState(data.sun_location?.city_id||'');
  const [busy,setBusy]=useState(false);
  useEffect(()=>setSelected(data.sun_location?.city_id||''),[data.sun_location?.city_id]);
  const save=async e=>{e.preventDefault();setBusy(true);try{await run('/household/sun-location','PATCH',{city_id:selected||null}, selected?'Household Sun Hours location saved.':'Household Sun Hours location cleared.')}catch{}finally{setBusy(false)}};
  return <section id="sun-location" className="panel sun-location-panel">
    <div className="panel-top"><div><h2><Sun size={18}/> Sun Hours location</h2><p>Choose the city for sunrise and sunset estimates shown on your family Dashboard.</p></div></div>
    <form onSubmit={save} className="sun-city-form">
      <Field label="Household city" as="select" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">No city selected</option>{CITY_OPTIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Field>
      <Button type="submit" icon={Save} loading={busy} disabled={selected===(data.sun_location?.city_id||'')}>Save location</Button>
    </form>
    <p className="setting-help"><Info size={16}/> City-center estimates, not live weather. This choice is shared by your household. No GPS or street address is collected.</p>
  </section>;
}

/** Truly continuous, keyboard-accessible slider. Live preview runs on every
 * input event; the final value is persisted on release (or after keyboard pause).
 */
function ContinuousPreferenceSlider({id,label,value,min,max,step,format,encode,kind,onSave,preferences}){
  const [position,setPosition]=useState(()=>Number(value));
  const positionRef=useRef(Number(value));
  const dragging=useRef(false);
  const delayedSave=useRef(null);
  useEffect(()=>{
    if(!dragging.current){const n=Number(value);positionRef.current=n;setPosition(n)}
  },[value]);
  useEffect(()=>()=>clearTimeout(delayedSave.current),[]);
  const preview=n=>{
    const numeric=clamp(n,min,max);
    positionRef.current=numeric;
    setPosition(numeric);
    applyDisplayPreferences({...preferences,[kind]:encode(numeric)});
  };
  const commit=()=>{
    clearTimeout(delayedSave.current);
    dragging.current=false;
    const encoded=encode(positionRef.current);
    if(encoded!==preferences[kind])onSave({[kind]:encoded});
  };
  const move=e=>{
    preview(Number(e.target.value));
    if(!dragging.current){
      clearTimeout(delayedSave.current);
      delayedSave.current=setTimeout(commit,450);
    }
  };
  const percent=100*(position-min)/(max-min);
  return <div className="preference-slider preference-slider-continuous">
    <div className="preference-slider-heading"><label htmlFor={id}><SlidersHorizontal size={16}/>{label}</label><output htmlFor={id} className="preference-current-value">{format(position)}</output></div>
    <div className="preference-slider-track" style={{'--pref-progress':`${percent}%`}}>
      <input id={id} className="preference-range-input" type="range" min={min} max={max} step={step} value={position}
        aria-valuetext={format(position)} onPointerDown={()=>{dragging.current=true;clearTimeout(delayedSave.current)}}
        onPointerUp={commit} onPointerCancel={commit} onBlur={commit} onKeyUp={commit} onChange={move}/>
    </div>
    <div className="preference-range-labels" aria-hidden="true"><span>{kind==='theme'?'Light':'Smaller'}</span><span>{kind==='theme'?'Dark':'Larger'}</span></div>
  </div>;
}

function SettingsPage(){const {data,logout,toast,updatePreferences,preferencesSaving}=useApp();const p=data.preferences;const save=next=>updatePreferences(next);const copy=async()=>{try{await navigator.clipboard.writeText(data.user.household.invite_code);toast('Household invite code copied.')}catch{toast('Could not copy automatically. Select the code and copy it.','error')}};return <><PageHero variant="settings" eyebrow="MAKE HAVEN YOURS" title="Settings & Accessibility" description="Set up a more comfortable experience for everyone at home." actions={<a className="btn btn-primary" href="#profile-avatar"><Camera size={17}/> Personalize profile</a>} visualValue={(data.user.name||'You').trim().split(/\s+/)[0]} visualLabel="Your profile" avatar={<ProfileAvatar member={data.user}/>} metrics={[{label:'Appearance',value:p.theme==='luxe'?'Haven Luxe':themeAmount(p.theme)===0?'Light':themeAmount(p.theme)===100?'Dark':'Custom'},{label:'Your household',value:data.user.household.name}]} visualNote="Preferences are personal to your account." footer="A home that feels like yours"/><div className="settings-grid"><div className="settings-stack"><AvatarPicker/><HouseholdSunLocationPicker/><Panel title="Appearance" subtitle="Choose the look that feels right for you"><div className="setting-label">COLOR THEME</div><div className="setting-options haven-theme-options"><button onClick={()=>save({theme:'light'})} aria-pressed={p.theme!=='luxe'&&themeAmount(p.theme)===0} className={`theme-choice ${p.theme!=='luxe'&&themeAmount(p.theme)===0?'selected':''}`}><div className="theme-swatch swatch-light"><Sun size={22}/></div><strong>Light</strong><small>Bright and clear</small>{p.theme!=='luxe'&&themeAmount(p.theme)===0&&<CheckCircle2 className="choice-check" size={20}/>}</button><button onClick={()=>save({theme:'dark'})} aria-pressed={p.theme!=='luxe'&&themeAmount(p.theme)===100} className={`theme-choice ${p.theme!=='luxe'&&themeAmount(p.theme)===100?'selected':''}`}><div className="theme-swatch swatch-dark"><Moon size={22}/></div><strong>Dark</strong><small>Soft on the eyes</small>{p.theme!=='luxe'&&themeAmount(p.theme)===100&&<CheckCircle2 className="choice-check" size={20}/>}</button><button onClick={()=>save({theme:'luxe'})} aria-pressed={p.theme==='luxe'} className={`theme-choice theme-choice-luxe ${p.theme==='luxe'?'selected':''}`}><div className="theme-swatch swatch-luxe"><Sparkles size={23}/><span>HAVEN LUXE</span></div><strong>Haven Luxe</strong><small>Glass · Home ambience</small>{p.theme==='luxe'&&<CheckCircle2 className="choice-check" size={20}/>}</button></div><p className="setting-help haven-luxe-tip"><Sparkles size={16}/> Haven Luxe uses a living-room background with readable frosted-glass panels. Dragging the Light/Dark slider switches back to the classic theme.</p><ContinuousPreferenceSlider id="haven-theme-slider" label="Light / Dark intensity" min={0} max={100} step={1} kind="theme" value={themeAmount(p.theme)} preferences={p} onSave={save} encode={encodeTheme} format={n=>n===0?'Light':n===100?'Dark':`${Math.round(n)}% dark`}/></Panel><Panel title="Readability" subtitle="Make content easier to read"><div className="setting-label">TEXT SIZE</div><div className="size-options">{[{id:'normal',label:'Standard',size:'Aa'},{id:'large',label:'Large',size:'Aa'},{id:'extra',label:'Extra large',size:'Aa'}].map(s=><button key={s.id} onClick={()=>save({text_size:s.id})} aria-pressed={Math.abs(textPixels(p.text_size)-({normal:15,large:17,extra:19}[s.id]))<.05} className={`size-choice text-${s.id} ${Math.abs(textPixels(p.text_size)-({normal:15,large:17,extra:19}[s.id]))<.05?'selected':''}`}><span>{s.size}</span><small>{s.label}</small></button>)}</div><ContinuousPreferenceSlider id="haven-text-slider" label="Text size — fine adjustment" min={13} max={20} step={0.1} kind="text_size" value={textPixels(p.text_size)} preferences={p} onSave={save} encode={encodeText} format={n=>`${Number(n).toFixed(1)} px`}/><p className="setting-help" aria-live="polite"><Info size={16}/> {preferencesSaving?"Saving your display preferences in the background…":"Your preferences apply instantly across the website and are saved to your account."}</p></Panel><Panel title="Your account" subtitle="Personal information and household access"><div className="setting-row"><span>Name</span><strong>{data.user.name}</strong></div><div className="setting-row"><span>Email</span><strong>{data.user.email}</strong></div><div className="setting-row"><span>Household</span><strong>{data.user.household.name}</strong></div><div className="setting-row"><span>Invite family members</span><div className="invite-row"><code>{data.user.household.invite_code}</code><Button variant="outline" icon={Copy} onClick={copy}>Copy code</Button></div></div><p className="setting-help"><ShieldCheck size={16}/> Share this code privately with trusted household members. Anyone with it can request to join your household.</p><div className="settings-logout"><Button variant="outline" icon={LogOut} onClick={logout}>Sign out</Button></div></Panel></div><aside className="settings-stack"><div className="access-tip"><div className="note-icon"><Type size={22}/></div><h3>Designed with everyone in mind.</h3><p>Clear labels, keyboard-friendly controls, adjustable type, and predictable navigation help every family member feel at home here.</p></div><Panel title="Alternative interaction" subtitle="Voice commands considered for future iterations"><div className="voice-concept"><MessageSquareText size={21}/><div><strong>“Show today's schedule”</strong><p>A possible voice shortcut to open calendar events.</p></div></div><p className="settings-description">Benefit: easier hands-free access. Limitation: speech accuracy and microphone privacy. Voice is not enabled in this version; everyone can access the same task through Dashboard → Family Calendar.</p></Panel></aside></div></>}

createRoot(document.getElementById('root')).render(<BrowserRouter><Provider><AppShell/></Provider></BrowserRouter>);
