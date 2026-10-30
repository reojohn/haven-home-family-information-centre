import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router-dom';
import {ArrowLeft, ChevronRight, Crown, House, ShieldCheck, UserPlus, Users, X} from 'lucide-react';
import './FamilyMembersPanel.css';

/**
 * Read-only household directory. It uses the members already supplied by /api/bootstrap.
 * No extra requests, schema changes, or new household permissions are required.
 */
export default function FamilyMembersPanel({household, members, user, renderAvatar, onClose, onNavigate}){
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const backRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const list = Array.isArray(members) && members.length ? members : [user];
  const ownerId = list[0]?.id; // Bootstrap orders members by ID; the first account created the household.
  const selected = list.find(member => member.id === selectedId) || null;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const handleKeydown = event => {
      if(event.key === 'Escape'){
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if(event.key === 'Tab'){
        const focusables = [...(panelRef.current?.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || [])]
          .filter(element => element.getClientRects().length > 0);
        if(!focusables.length)return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if(event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))){
          event.preventDefault();last.focus();
        }else if(!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))){
          event.preventDefault();first.focus();
        }
      }
    };
    document.addEventListener('keydown',handleKeydown,true);
    return () => {
      document.removeEventListener('keydown',handleKeydown,true);
      document.body.style.overflow = previousOverflow;
      if(previouslyFocused?.isConnected)previouslyFocused.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if(selectedId !== null)backRef.current?.focus();
  }, [selectedId]);

  const memberRole = member => member.id === ownerId ? 'Household owner' : 'Family member';
  const openPage = () => {onNavigate();};

  return createPortal(<div className="family-panel-root">
    <div className="family-panel-backdrop" aria-hidden="true" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}/>
    <aside id="family-members-drawer" className="family-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="family-panel-title" aria-describedby="family-panel-description" tabIndex={-1}>
      <div className="family-panel-header">
        <div className="family-panel-heading-icon"><House size={21} aria-hidden="true"/></div>
        <div className="family-panel-heading-text">
          <span className="family-panel-eyebrow">OUR SHARED SPACE</span>
          <h2 id="family-panel-title" title={household?.name}>{household?.name || 'Our family'}</h2>
          <p id="family-panel-description">{list.length} registered {list.length===1?'member':'members'}</p>
        </div>
        <button ref={closeRef} type="button" className="family-panel-close" onClick={onClose} aria-label="Close family members panel" title="Close panel"><X size={20}/></button>
      </div>

      <div className="family-panel-scroll">
        {selected ? <div className="family-panel-profile" key={selected.id}>
          <button ref={backRef} type="button" className="family-panel-back" onClick={()=>setSelectedId(null)}><ArrowLeft size={17}/> Back to all members</button>
          <div className="family-panel-profile-card">
            <div className="family-panel-profile-avatar">{renderAvatar(selected,list.indexOf(selected))}</div>
            <span className="family-panel-profile-label">HOUSEHOLD MEMBER</span>
            <h3>{selected.name || 'Family member'}</h3>
            <span className="family-panel-role-pill">{selected.id === ownerId?<Crown size={15}/>:<Users size={15}/>} {memberRole(selected)}{selected.id===user.id?' · You':''}</span>
            <p>{selected.id===user.id?'This is your profile in the family space.':'This person is a registered member of your shared household.'}</p>
            {selected.id === user.id && <Link to="/settings#profile-avatar" onClick={openPage} className="family-panel-primary-link">Edit my profile <ChevronRight size={17}/></Link>}
          </div>
          <div className="family-panel-info-note"><ShieldCheck size={18}/><span>Members can view household profiles. Personal account details and permissions remain private.</span></div>
        </div> : <>
          <div className="family-panel-intro"><span className="family-panel-section-label"><Users size={16}/> FAMILY MEMBERS</span><span className="family-panel-count">{list.length} total</span></div>
          <div className="family-panel-member-list">
            {list.map((member,index)=><button key={member.id} type="button" className="family-panel-member" onClick={()=>setSelectedId(member.id)} aria-label={`View ${member.name || 'family member'} profile`}>
              <span className="family-panel-member-avatar">{renderAvatar(member,index)}</span>
              <span className="family-panel-member-details"><strong>{member.name || 'Family member'}</strong><small>{member.id===user.id?'You · ':''}{memberRole(member)}</small></span>
              {member.id===ownerId&&<Crown className="family-panel-owner-icon" size={16} aria-label="Household owner"/>}
              <ChevronRight className="family-panel-member-chevron" size={18} aria-hidden="true"/>
            </button>)}
          </div>
          <div className="family-panel-actions">
            <span className="family-panel-section-label">HOUSEHOLD ACTIONS</span>
            <Link to="/settings" className="family-panel-action" onClick={openPage}><span className="family-panel-action-icon"><UserPlus size={19}/></span><span><strong>Invite family member</strong><small>Find and copy your household invite code</small></span><ChevronRight size={18}/></Link>
            {user.is_household_owner===true&&<Link to="/settings" className="family-panel-action" onClick={openPage}><span className="family-panel-action-icon"><House size={19}/></span><span><strong>Household settings</strong><small>View account and household information</small></span><ChevronRight size={18}/></Link>}
          </div>
        </>}
      </div>
      <div className="family-panel-footer"><ShieldCheck size={15}/><span>Only members of this household can view this directory.</span></div>
    </aside>
  </div>,document.body);
}
