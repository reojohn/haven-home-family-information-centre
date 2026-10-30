import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight, CalendarDays, Sparkles, UsersRound, X} from 'lucide-react';
import './WelcomeModal.css';

/** Displayed only after a successful sign-in. Keeping the profile name dynamic
 *  means the same illustration can welcome every member of the household. */
export default function WelcomeModal({user,onClose}) {
  const okayRef=useRef(null);
  const closeRef=useRef(null);
  const displayName=String(user?.name || 'there').trim() || 'there';
  const firstName=displayName.split(/\s+/)[0];
  const householdName=String(user?.household?.name || 'Your household');
  const today= new Intl.DateTimeFormat('en-US',{
    weekday:'long',month:'short',day:'numeric',year:'numeric'
  }).format(new Date());

  useEffect(()=>{
    const previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    okayRef.current?.focus();
    function onKeyDown(event) {
      if(event.key==='Escape') {
        event.preventDefault();
        onClose();
      } else if(event.key==='Tab') {
        // The modal intentionally contains only two focusable controls.
        const first=closeRef.current;
        const last=okayRef.current;
        if(!first || !last) return;
        const inside=[first,last].includes(document.activeElement);
        if(event.shiftKey && (!inside || document.activeElement===first)) {
          event.preventDefault();
          last.focus();
        } else if(!event.shiftKey && (!inside || document.activeElement===last)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown',onKeyDown);
    return ()=>{
      document.body.style.overflow=previousOverflow;
      document.removeEventListener('keydown',onKeyDown);
      if(previousFocus?.isConnected) previousFocus.focus();
    };
  },[onClose]);

  return createPortal(
    <div className="haven-welcome-backdrop" onMouseDown={event=>{
      if(event.target===event.currentTarget) onClose();
    }}>
      <section className="haven-welcome-card" role="dialog" aria-modal="true"
        aria-labelledby="haven-welcome-title" aria-describedby="haven-welcome-description">
        <button ref={closeRef} type="button" className="haven-welcome-close"
          aria-label="Close welcome message" onClick={onClose}><X size={19}/></button>

        <div className="haven-welcome-art" aria-hidden="true">
          <div className="haven-welcome-art-halo" />
          <span className="haven-welcome-art-spark haven-welcome-art-spark-left"><Sparkles size={18}/></span>
          <span className="haven-welcome-art-spark haven-welcome-art-spark-right"><Sparkles size={15}/></span>
          <img className="haven-welcome-character" src="/illustrations/welcome-waving-avatar.png"
            alt="" draggable="false" decoding="async"/>
        </div>

        <div className="haven-welcome-content">
          <div className="haven-welcome-brand">
            <div className="haven-welcome-brand-logo" aria-hidden="true">
              <img src="/branding/haven-home-gold-emerald.png" alt="" draggable="false"/>
            </div>
            <div className="haven-welcome-brand-copy">
              <strong>HAVEN HOME</strong>
              <span>Your family's everyday essentials</span>
            </div>
          </div>

          <div className="haven-welcome-eyebrow">
            <span className="haven-welcome-line"/> YOUR HOME, YOUR SPACE
            <span className="haven-welcome-line"/>
          </div>
          <h2 id="haven-welcome-title">Welcome, <span>{firstName}!</span></h2>
          <p id="haven-welcome-description" className="haven-welcome-description">
            It's lovely to have you back. Your household's little moments, plans, and everything in between are right here.
          </p>

          <div className="haven-welcome-bottom">
            <div className="haven-welcome-detail" title={householdName}>
              <span className="haven-welcome-detail-icon"><UsersRound size={20} aria-hidden="true"/></span>
              <span className="haven-welcome-detail-text">
                <strong>{householdName}</strong><small>Your household</small>
              </span>
            </div>
            <div className="haven-welcome-detail" title={today}>
              <span className="haven-welcome-detail-icon"><CalendarDays size={19} aria-hidden="true"/></span>
              <span className="haven-welcome-detail-text">
                <strong>{today}</strong><small>Have a great day!</small>
              </span>
            </div>
            <button ref={okayRef} type="button" className="haven-welcome-okay" onClick={onClose}>
              <span>Okay, let's go</span><ArrowRight size={20} aria-hidden="true"/>
            </button>
          </div>
        </div>
      </section>
    </div>,document.body
  );
}
