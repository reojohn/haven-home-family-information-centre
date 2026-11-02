import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {Check, LogOut, ShieldCheck} from 'lucide-react';
import './SignOutExperience.css';

// One non-dismissible progress dialog for both the header and Settings sign-out.
// It closes only when the server finishes the sign-out (or reports an error).
export default function SignOutExperience({active}) {
  const dialogRef=useRef(null);
  useEffect(()=>{
    if(!active)return;
    const previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.focus();
    const preventBackgroundKeyboard=(event)=>{
      if(event.key==='Tab' || event.key==='Escape')event.preventDefault();
    };
    document.addEventListener('keydown',preventBackgroundKeyboard,true);
    return ()=>{
      document.removeEventListener('keydown',preventBackgroundKeyboard,true);
      document.body.style.overflow=previousOverflow;
      if(previousFocus?.isConnected)previousFocus.focus();
    };
  },[active]);

  if(!active)return null;
  return createPortal(
    <div className="haven-signout-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="haven-signout-dialog" role="dialog" aria-modal="true" aria-labelledby="haven-signout-title" aria-describedby="haven-signout-description">
        <div className="haven-signout-icon" aria-hidden="true">
          <span className="haven-signout-icon-arc"/>
          <LogOut size={30} strokeWidth={2.1}/>
        </div>
        <span className="haven-signout-eyebrow"><ShieldCheck size={14}/> YOUR FAMILY SPACE</span>
        <h2 id="haven-signout-title">Signing you out<span className="haven-signout-dots" aria-hidden="true">…</span></h2>
        <p id="haven-signout-description">Ending your session securely.<br/>See you back at Haven Home soon!</p>
        <div className="haven-signout-loading" aria-hidden="true"><span/></div>
        <div className="haven-signout-footnote"><Check size={14}/> Your household space stays private</div>
      </section>
    </div>,
    document.body
  );
}
