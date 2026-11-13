import {useEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {CARDS,OBJECTIVES,type Token} from '@rokugan/engine';
import manifest from '../public/art/assets.json';
type Asset={path:string}|null;
const assets=manifest as unknown as {cards:Record<string,Asset>;objectives:Record<string,Asset>;tokens:Record<string,Record<string,Asset>>};
export const clanColors:Record<string,string>={crab:'#427bad',crane:'#75accd',dragon:'#419b62',lion:'#cda43b',phoenix:'#df8243',scorpion:'#b34846',unicorn:'#a366ba'};
export const tokenLabels:Record<string,string>={army:'Армия',navy:'Флот',shinobi:'Синоби',blessing:'Благословение',raid:'Набег',diplomacy:'Дипломатия',bluff:'Блеф'};
const marks:Record<string,string>={crab:'蟹',crane:'鶴',dragon:'龍',lion:'獅',phoenix:'鳳',scorpion:'蠍',unicorn:'麟'};
export function ClanSeal({clan}:{clan?:string}){return <g>{clan&&<image href={`/art/emblems/${clan}.webp`} x={-14} y={-14} width={28} height={28}/>}<circle opacity={clan?0:1} r="14" fill={clanColors[clan??'']??'#67716c'} stroke="#f3dfae" strokeWidth="2"/><circle opacity={clan?0:1} r="10" fill="none" stroke="#ead6a5"/><text opacity={clan?0:1} y="5" textAnchor="middle" fontSize="13" fill="#fff6dc">{marks[clan??'']??'◆'}</text></g>;}
export function TokenGlyph({clan,token}:{clan?:string;token:Token|null}){
 const asset=assets.tokens[clan??'']?.[token?`${token.kind}-${token.strength}`:'back'];
 // Сканы с прозрачным фоном (tools/clean_tokens.py): рисуем в собственных пропорциях, без обрезки.
 if(asset)return <g className="scanned-token"><image href={asset.path} x={-17} y={-18} width={34} height={36} preserveAspectRatio="xMidYMid meet"/></g>;
 const color=clanColors[clan??'']??'#586569';
 return <g className="token-glyph"><path d="M0 -18L15 -7L15 14Q15 17 12 17H-12Q-15 17 -15 14V-7Z" fill={token?'#ead7ad':color} stroke="#42382c" strokeWidth="1.5"/><path d="M0 -14L4 -10H-4Z" fill={color}/><circle cy="3" r="11" fill={token?'#f9edce':'#25343c'} stroke={color} strokeWidth="1.5"/>
 {!token?<text y="7" textAnchor="middle" fontSize="14" fill="#f6e2ac">{marks[clan??'']??'◆'}</text>:<>
 <g transform="translate(0 -1)" fill="none" stroke="#35312b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
 {token.kind==='army'&&<path d="M-7 2L5 -9L7 -7L-5 4M-7 -1L-2 4M-7 4L-9 6"/>}
 {token.kind==='navy'&&<path d="M-8 1H8L4 5H-4ZM0 -9V1M1 -8L6 -1H1M-7 7Q-3 5 0 7Q3 5 7 7"/>}
 {token.kind==='shinobi'&&<path d="M0 -10L2 -3L9 -1L2 1L0 8L-2 1L-9 -1L-2 -3Z"/>}
 {token.kind==='blessing'&&<path d="M0 -9V5M-7 -2H7M-5 -7L5 3M5 -7L-5 3"/>}
 {token.kind==='raid'&&<path d="M0 -10Q5 -4 1 -2Q8 -4 7 3Q5 9 0 8Q-8 8 -7 1Q-4 -2 -3 -6Q-4 3 0 3Q3 0 0 -10Z"/>}
 {token.kind==='diplomacy'&&<path d="M-7 5V-6H7V5M-5 -3H5M-5 0H5M-5 3H2"/>}
 {token.kind==='bluff'&&<circle cy="-1" r="6" strokeDasharray="2 2"/>}
 </g>{token.strength>0&&<g><circle cx="10" cy="11" r="7" fill={color} stroke="#f7e6bf"/><text x="10" y="14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">{token.strength}</text></g>}</>}
 </g>;
}
export function Emblem({clan,className=''}:{clan?:string;className?:string}){return <svg className={`clan-emblem ${className}`} viewBox="-17 -17 34 34" aria-hidden="true"><ClanSeal clan={clan}/></svg>;}
export function TokenArt({clan,token,label}:{clan?:string;token:Token|null;label?:string}){return <svg className="token-art" viewBox="-20 -21 40 42" role="img" aria-label={label??(token?`${tokenLabels[token.kind]} ${token.strength||''}`:'Закрытый жетон')}><TokenGlyph clan={clan} token={token}/></svg>;}
export function CardArt({id,type='territory',name,children,onSelect,selected=false}:{id:string;type?:'territory'|'objective';name:string;children?:ReactNode;onSelect?:()=>void;selected?:boolean}){
 const src=(type==='objective'?assets.objectives:assets.cards)[id]?.path,description=type==='objective'?OBJECTIVES[id]?.description:CARDS.find(c=>c.id===id)?.description;
 const face=src?<img src={src} alt={name} loading="lazy" draggable={false}/>:<span className="card-title-cover">{name}</span>;
 return <div className={`component-card ${selected?'selected':''}`}><ArtZoom src={src??'/art/cards/territory-back.png'} title={name} description={description} onClick={onSelect} label={onSelect?`Выбрать карту: ${name}`:undefined}>{face}</ArtZoom>{children}</div>;
}
/**
 * Картинка, которая при наведении показывается крупно рядом (как карты в Анк-Морпорке).
 * Превью рисуется в body: стили колонки не искажают его размер. На касание — показ/скрытие.
 */
export function ArtZoom({src,title,description,children,className='',onClick,label}:{src:string;title:string;description?:string;children:ReactNode;className?:string;onClick?:()=>void;label?:string}){
 const [box,setBox]=useState<{left:number;top:number;height:number}|null>(null);
 const show=(el:HTMLElement)=>{const r=el.getBoundingClientRect(),height=Math.min(innerHeight*.62,600),width=height*.66+(description?0:0);
  const left=r.right+16+width<innerWidth?r.right+16:Math.max(8,r.left-16-width),top=Math.max(8,Math.min(r.top+r.height/2-height/2,innerHeight-height-8));setBox({left,top,height});};
 useEffect(()=>{if(!box)return;const hide=()=>setBox(null);addEventListener('scroll',hide,true);return()=>removeEventListener('scroll',hide,true);},[box]);
 return <><button type="button" className={`art-zoom ${onClick?'playable':''} ${className}`} aria-label={label??`${title}${description?': '+description:''}`} onMouseEnter={e=>show(e.currentTarget)} onMouseLeave={()=>setBox(null)} onFocus={e=>show(e.currentTarget)} onBlur={()=>setBox(null)} onClick={e=>{if(onClick){setBox(null);onClick();}else if(box)setBox(null);else show(e.currentTarget);}}>{children}</button>
 {box&&createPortal(<div className="card-preview" style={{left:box.left,top:box.top,height:box.height}} aria-hidden="true"><img src={src} alt=""/>{description&&<p><b>{title}</b>{description}</p>}</div>,document.body)}</>;
}

/** Жетон, который при наведении показывается крупно (примерно в 3 раза) с подписью — поверх всех колонок. */
export function HoverToken({clan,token,children,className='',...rest}:{clan?:string;token:Token;children:ReactNode;className?:string}&React.HTMLAttributes<HTMLElement>){
 const [at,setAt]=useState<{x:number;y:number}|null>(null);
 return <span className={`hover-token ${className}`} {...rest} onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setAt({x:r.left+r.width/2,y:r.top});}} onMouseLeave={()=>setAt(null)}>{children}
  {at&&createPortal(<div className="token-preview" style={{left:at.x,top:at.y}} aria-hidden="true"><TokenArt clan={clan} token={token}/><span>{tokenLabels[token.kind]}{token.strength?' '+token.strength:''}</span></div>,document.body)}</span>;
}
export function Magnifier(){return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m15 15 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;}
