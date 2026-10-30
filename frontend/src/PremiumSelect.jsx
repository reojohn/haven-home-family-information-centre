import React, {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from 'lucide-react';

/**
 * A keyboard-friendly, controlled replacement for the small native option lists
 * used across Haven Home. Keeps the same onChange(event.target.value) contract
 * so existing filters, forms, and server payloads continue to work unchanged.
 * Menus live in document.body to avoid clipping by panels, charts and modals.
 */
export default function PremiumSelect({children,value,defaultValue,onChange,onBlur,onFocus,name,id,
  disabled=false,required=false,className='',style,placeholder='Select an option',...rest}) {
  const listId=useId();
  const triggerRef=useRef(null);
  const menuRef=useRef(null);
  const typeAhead=useRef({text:'',at:0});
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const [placement,setPlacement]=useState(null);
  const [internalValue,setInternalValue]=useState(defaultValue);

  // Accept native <option> children, including options produced through .map().
  const options=useMemo(()=>{
    const items=[];
    const collect=nodes=>React.Children.forEach(nodes,node=>{
      if(!React.isValidElement(node))return;
      if(node.type===React.Fragment || node.type==='optgroup'){
        collect(node.props.children);
      }else if(node.type==='option'){
        const label=node.props.label ?? React.Children.toArray(node.props.children).join('');
        const raw=node.props.value ?? label;
        items.push({value:String(raw),label:String(label),disabled:!!node.props.disabled});
      }
    });
    collect(children);
    return items;
  },[children]);
  const actual=value!==undefined?value:internalValue;
  const selectedIndex=options.findIndex(item=>item.value===String(actual ?? ''));
  const current=options[selectedIndex];
  const disabledAll=disabled || options.length===0;
  const accessibleName=rest['aria-label'] || placeholder;

  const measure=useCallback(()=>{
    const node=triggerRef.current;
    if(!node)return;
    const box=node.getBoundingClientRect();
    const vw=document.documentElement.clientWidth;
    const vh=window.visualViewport?.height || window.innerHeight;
    const topOffset=window.visualViewport?.offsetTop || 0;
    const desiredHeight=Math.min(286,options.length*42+12);
    const below=vh+topOffset-box.bottom-12;
    const above=box.top-topOffset-12;
    const upward=below<Math.min(200,desiredHeight) && above>below;
    const room=Math.max(84,Math.min(desiredHeight,(upward?above:below)-8));
    const width=Math.min(Math.max(190,box.width),vw-20);
    const left=Math.max(10,Math.min(box.left,vw-width-10));
    setPlacement({top:upward?box.top-8-room:box.bottom+8,left,width,maxHeight:room,upward});
  },[options.length]);

  useLayoutEffect(()=>{if(open)measure();},[open,measure]);
  useEffect(()=>{
    if(!open)return;
    const onOutside=event=>{
      if(!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target))setOpen(false);
    };
    const onPosition=()=>measure();
    document.addEventListener('pointerdown',onOutside,true);
    window.addEventListener('resize',onPosition);
    window.addEventListener('scroll',onPosition,true);
    window.visualViewport?.addEventListener('resize',onPosition);
    return ()=>{
      document.removeEventListener('pointerdown',onOutside,true);
      window.removeEventListener('resize',onPosition);
      window.removeEventListener('scroll',onPosition,true);
      window.visualViewport?.removeEventListener('resize',onPosition);
    };
  },[open,measure]);
  useEffect(()=>{
    if(open && menuRef.current){
      menuRef.current.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'});
    }
  },[active,open]);

  function openMenu(index=selectedIndex){
    if(disabledAll)return;
    let next=Math.max(0,index);
    if(options[next]?.disabled)next=options.findIndex(item=>!item.disabled);
    setActive(Math.max(0,next));
    setOpen(true);
  }
  function choose(index){
    const item=options[index];
    if(!item||item.disabled)return;
    if(value===undefined)setInternalValue(item.value);
    if(item.value!==String(actual??'')){
      onChange?.({target:{value:item.value,name:name||'',id:id||''},currentTarget:{value:item.value,name:name||'',id:id||''}});
    }
    setOpen(false);
    triggerRef.current?.focus({preventScroll:true});
  }
  function move(delta){
    if(!open){openMenu(delta<0?options.length-1:selectedIndex);return;}
    let i=active;
    for(let n=0;n<options.length;n++){
      i=(i+delta+options.length)%options.length;
      if(!options[i].disabled){setActive(i);break;}
    }
  }
  function onKeyDown(event){
    if(disabledAll)return;
    if(event.key==='ArrowDown' || event.key==='ArrowUp'){
      event.preventDefault();move(event.key==='ArrowDown'?1:-1);
    }else if(event.key==='Home' || event.key==='End'){
      event.preventDefault();
      if(!open)openMenu();
      const order=event.key==='Home'?options.map((_,i)=>i):options.map((_,i)=>options.length-1-i);
      setActive(order.find(i=>!options[i].disabled) ?? 0);
    }else if(event.key==='Enter' || event.key===' '){
      event.preventDefault();
      if(open)choose(active);else openMenu();
    }else if(event.key==='Escape'){
      if(open){event.preventDefault();event.stopPropagation();setOpen(false);}
    }else if(event.key==='Tab'){
      setOpen(false);
    }else if(event.key.length===1 && !event.ctrlKey && !event.metaKey && !event.altKey){
      const now=Date.now();
      const search=(now-typeAhead.current.at<700?typeAhead.current.text:'')+event.key.toLocaleLowerCase();
      typeAhead.current={text:search,at:now};
      const found=options.findIndex(item=>!item.disabled && item.label.toLocaleLowerCase().startsWith(search));
      if(found>=0){event.preventDefault();if(!open)openMenu(found);else setActive(found);}
    }
  }

  return <div className={`haven-select ${open?'haven-select-open':''} ${disabledAll?'haven-select-disabled':''} ${className}`} style={style}>
    <button
      {...rest}
      id={id}
      type="button"
      name={name}
      ref={triggerRef}
      disabled={disabledAll}
      className="haven-select-trigger"
      role="combobox"
      aria-label={rest['aria-label']||undefined}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open?listId:undefined}
      aria-activedescendant={open?`${listId}-option-${active}`:undefined}
      aria-required={required||undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onClick={event=>{
        event.preventDefault();event.stopPropagation();
        if(open)setOpen(false);else openMenu();
      }}
    >
      <span className={`haven-select-value ${!current?'haven-select-placeholder':''}`}>{current?.label??placeholder}</span>
      <span className="haven-select-caret" aria-hidden="true"><ChevronDown size={16}/></span>
    </button>
    {open && placement && createPortal(<div
      ref={menuRef}
      className={`haven-select-menu ${placement.upward?'haven-select-menu-up':''}`}
      role="listbox"
      id={listId}
      aria-label={accessibleName}
      style={{top:placement.top,left:placement.left,width:placement.width,maxHeight:placement.maxHeight}}
    >
      {options.map((item,index)=><div
        key={`${item.value}-${index}`}
        id={`${listId}-option-${index}`}
        role="option"
        aria-selected={item.value===String(actual??'')}
        aria-disabled={item.disabled||undefined}
        data-active={index===active}
        className={`haven-select-option ${item.value===String(actual??'')?'is-selected':''} ${index===active?'is-active':''}`}
        onMouseEnter={()=>{if(!item.disabled)setActive(index);}}
        onPointerDown={event=>event.preventDefault()}
        onClick={event=>{event.stopPropagation();choose(index);}}
      >
        <span className="haven-select-option-text">{item.label}</span>
        {item.value===String(actual??'')&&<Check size={16} className="haven-select-tick" aria-hidden="true"/>}
      </div>)}
    </div>,document.body)}
  </div>;
}
