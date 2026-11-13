import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {LAND_BORDERS,SEA_BORDERS,type PlayerView,type Placement,type Special} from '@rokugan/engine';
import boardPoints from '../public/art/board-points.json';
import {clanColors,TokenGlyph,TokenArt,tokenLabels} from './Art';
const points=boardPoints.points as Record<string,{x:number;y:number}>;
/** Контуры провинций, найденные по скану поля (tools/fit_provinces.py). */
const regions=(boardPoints as unknown as {regions?:Record<string,number[][][]>}).regions??{};
/** Точки на сухопутных границах, посчитанные по найденным контурам; иначе — из board.ts. */
const borderPoints=(boardPoints as unknown as {borders?:Record<string,[number,number]>}).borders??{};
function borderAt(a:string|number,b:string|number,x:number,y:number){const p=borderPoints[`${a}-${b}`]??borderPoints[`${b}-${a}`];return p?{x:p[0],y:p[1]}:{x,y};}
const regionPath=(parts:number[][][])=>parts.map(part=>'M'+part.map(q=>q.join(' ')).join('L')+'Z').join('');
const W=600,H=900,MIN_W=110;
export const specialNames:Record<string,string>={peace:'Мир',scorched:'Выжженная земля',shrine:'Святилище',battlefield:'Поле битвы',harbor:'Порт',honor:'Честь',defense:'Защита'};
type PublicOrder=PlayerView['orders'][number];
function position(o:PublicOrder){const p=points[o.target];if(o.from==='sea')return SEA_BORDERS[o.target]??{x:p.x+30,y:p.y};if(o.from){const edge=LAND_BORDERS.find(([a,b])=>[String(a),String(b)].includes(o.target)&&[String(a),String(b)].includes(o.from!));if(edge)return borderAt(edge[0],edge[1],edge[2],edge[3]);}return{x:p.x,y:p.y};}
/** Видимая область поля: центр и сколько единиц поля помещается по ширине экрана. */
interface View{cx:number;cy:number;w:number}
export function ArtBoard({s,target,from,onPosition,round,selecting,viewer,onOrder,selectedOrder,focus,options,manual,selectedOrders=[],provinceTargeting=false,highlightedPlayer=null}:{highlightedPlayer?:string|null;provinceTargeting?:boolean;selectedOrders?:string[];s:PlayerView;target:string;from:string;onPosition:(id:string,from?:string)=>void;round:number;selecting:boolean;viewer:string;onOrder:(id:string)=>void;selectedOrder:string;focus?:string;options:Placement[];manual:boolean}){
 const [stack,setStack]=useState<string|null>(null);
 const [edge,setEdge]=useState<{a:string;b:string;x:number;y:number}|null>(null),[hover,setHover]=useState(''),[hoverProvince,setHoverProvince]=useState(''),[ghosts,setGhosts]=useState<PublicOrder[]>([]),hoverTimer=useRef<ReturnType<typeof setTimeout>>(),previous=useRef(s.orders);
 const svg=useRef<SVGSVGElement>(null),box=useRef<HTMLDivElement>(null),[size,setSize]=useState({w:800,h:800});
 const fitW=()=>size.h<20?W:Math.max(W,H*size.w/size.h);
 const [view,setView]=useState<View|null>(null);
 const v=view??{cx:W/2,cy:H/2,w:fitW()},vh=v.w*size.h/Math.max(1,size.w);
 const viewRef=useRef(v);viewRef.current=v;
 const pan=useRef<{x:number;y:number;view:View;moved:boolean;id:number}|null>(null),suppressClick=useRef(false);
 const signature=s.orders.map(o=>`${o.id}:${o.token?.id??'?'}:${o.target}:${o.from??''}`).join('|');
 useEffect(()=>{const removed=previous.current.filter(o=>!s.orders.some(n=>n.id===o.id));previous.current=s.orders;setGhosts(removed);if(!removed.length)return;const timer=setTimeout(()=>setGhosts([]),500);return()=>clearTimeout(timer);},[signature]);
 useEffect(()=>setEdge(null),[selecting,options.map(p=>p.token).join('|')]);
 useLayoutEffect(()=>{const node=box.current;if(!node)return;const ro=new ResizeObserver(()=>setSize({w:node.clientWidth,h:node.clientHeight}));ro.observe(node);return()=>ro.disconnect();},[]);
 /** Не даём увести поле за край: хотя бы половина экрана остаётся на карте. */
 const clampView=(n:View):View=>{
  const w=Math.min(fitW(),Math.max(MIN_W,n.w)),h=w*size.h/Math.max(1,size.w);
  // Если окно шире поля — поле по центру; иначе край окна не уходит за край карты.
  const axis=(c:number,len:number,full:number)=>len>=full?full/2:Math.min(full-len/2,Math.max(len/2,c));
  return{w,cx:axis(n.cx,w,W),cy:axis(n.cy,h,H)};
 };
 // Колесо: зум к курсору (React вешает wheel пассивным — нужен свой слушатель).
 useEffect(()=>{const el=svg.current;if(!el)return;const onWheel=(e:WheelEvent)=>{e.preventDefault();const cur=viewRef.current,r=el.getBoundingClientRect();const k=e.deltaY<0?.85:1/.85;const w=Math.min(fitW(),Math.max(MIN_W,cur.w*k)),ch=cur.w*r.height/r.width;
  // Точка под курсором остаётся под курсором.
  const px=cur.cx-cur.w/2+(e.clientX-r.left)/r.width*cur.w,py=cur.cy-ch/2+(e.clientY-r.top)/r.height*ch,f=w/cur.w;
  setView(clampView({w,cx:px-(px-cur.cx)*f,cy:py-(py-cur.cy)*f}));};el.addEventListener('wheel',onWheel,{passive:false});return()=>el.removeEventListener('wheel',onWheel);},[size.w,size.h]);
 // При раскрытии поле само подводит к провинции, где идёт бой.
 const hadFocus=useRef(false);
 useEffect(()=>{if(!focus||!points[focus]){if(hadFocus.current){hadFocus.current=false;setView(null);}return;}hadFocus.current=true;const pt=points[focus];setView(clampView({w:Math.min(viewRef.current.w,320),cx:pt.x,cy:pt.y}));},[focus]);
 const allowed=(id:string,source?:string)=>manual||options.some(p=>p.target===id&&(p.from??'')===(source??'')&&!p.parent);
 const keyAction=(e:React.KeyboardEvent,fn:()=>void)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}};
 const pick=(id:string,source?:string)=>{onPosition(id,source);setEdge(null);};
 const pickBorder=(a:string,b:string,x:number,y:number)=>{
  const forward=allowed(a,b),reverse=allowed(b,a);
  if(manual||(forward&&reverse)){setEdge({a,b,x,y});return;}
  if(forward)pick(a,b);else if(reverse)pick(b,a);
 };
 const zoomBy=(k:number)=>setView(clampView({...v,w:v.w*k}));
 const renderOrder=(o:PublicOrder,leaving=false)=>{const p=position(o),siblings=s.orders.filter(q=>!q.parent&&q.target===o.target&&q.from===o.from),slot=Math.max(0,siblings.findIndex(q=>q.id===o.id)),stackHover=!selecting&&!provinceTargeting&&!o.from&&siblings.some(q=>q.id===hover),offset=o.from?0:stackHover?((slot%4)-(Math.min(siblings.length,4)-1)/2)*28:Math.min(slot,3)*3,children=s.orders.filter(q=>q.parent===o.id),expanded=hover===o.id,x=p.x+offset,y=p.y+(o.from?0:stackHover?Math.floor(slot/4)*30:-Math.min(slot,3)*3),angle=Math.atan2(points[o.target].y-y,points[o.target].x-x)*180/Math.PI,owner=s.players[o.player];
 return <g key={o.id} className={`map-order ${leaving?'piece-exit':''} ${(selectedOrder===o.id||selectedOrders.includes(o.id))?'selected':''}`} role={leaving?undefined:'button'} tabIndex={leaving?undefined:0} aria-label={leaving?undefined:`Приказ ${owner.name}, ${s.provinces[o.target].name}, ${o.token?`${tokenLabels[o.token.kind]} ${o.token.strength}`:'закрыт'}`} onMouseEnter={()=>{clearTimeout(hoverTimer.current);setHover(o.id);}} onMouseLeave={()=>{hoverTimer.current=setTimeout(()=>setHover(''),180);}} onFocus={()=>setHover(o.id)} onBlur={()=>setHover('')} onClick={e=>{e.stopPropagation();if(provinceTargeting||selecting&&!o.from&&allowed(o.target)){pick(o.target);return;}if(!o.from&&siblings.length>1)setStack(o.target);else onOrder(o.id);}} onKeyDown={e=>keyAction(e,()=>{if(provinceTargeting||selecting&&!o.from&&allowed(o.target)){pick(o.target);return;}if(!o.from&&siblings.length>1)setStack(o.target);else onOrder(o.id);})}>
 <title>{`${owner.name}: ${o.token?`${tokenLabels[o.token.kind]}${o.token.strength?' '+o.token.strength:''}`:'закрытый приказ'}${o.from?o.from==='sea'?' · с моря':` · из ${s.provinces[o.from]?.name}`:' · в центре'}`}</title>
 <g style={{transition:"transform 180ms ease"}} transform={`translate(${x} ${y})`}><rect x="-17" y="-19" width="34" height="38" fill="transparent" pointerEvents={leaving?'none':'all'}/>
 <g className="piece-enter" key={`${o.token?.id??'back'}-${o.target}-${o.from}`}><g transform={`rotate(${o.from?angle+90:0}) scale(.78)`}><TokenGlyph clan={owner.clan} token={o.token}/></g></g>{(selectedOrder===o.id||selectedOrders.includes(o.id))&&<circle r="17" fill="none" stroke="#ffdf7c" strokeWidth="2.5"/>}
 {!o.from&&siblings.length>1&&slot===siblings.length-1&&!stackHover&& <g transform="translate(13 11)" pointerEvents="none"><circle r="8" fill="#19333b" stroke="#f6dda5" strokeWidth="1.5"/><text textAnchor="middle" y="3.5" fontSize="10" fill="#fff1cc" fontWeight="bold">{siblings.length}</text></g>}{children.map((c,i)=><g key={c.id} className="blessing-layer" style={{transform:`translate(${6+i*4}px, ${-9-i*5}px) scale(.72)`}}><g className="piece-enter"><TokenGlyph clan={s.players[c.player].clan} token={c.token}/></g></g>)}
 {expanded&&<g className="stack-tip" pointerEvents="none"><rect x="-75" y="24" width="150" height="22" rx="4"/><text x="0" y="39" textAnchor="middle">{owner.name}{children.length?' · с благословением':''}</text></g>}
 </g></g>;};
 const hovered=s.provinces[hoverProvince];
 return <div className="art-board">
 {stack&&<div className="stack-picker" role="group" aria-label="Жетоны провинции"><header><b>{s.provinces[stack].name} · выберите жетон</b><button onClick={()=>setStack(null)} aria-label="Закрыть выбор жетона">✕</button></header><div>{s.orders.filter(o=>o.target===stack&&!o.from&&!o.parent).map(o=><button key={o.id} aria-pressed={selectedOrders.includes(o.id)||selectedOrder===o.id} onClick={()=>{onOrder(o.id);setStack(null);}}><TokenArt clan={s.players[o.player].clan} token={o.token}/><span><b>{s.players[o.player].name}</b><small>{o.token?tokenLabels[o.token.kind]+(o.token.strength?' '+o.token.strength:''):'Закрытый приказ'}{s.orders.some(x=>x.parent===o.id)?' · защищён благословением':''}</small></span></button>)}</div></div>}
 <div className="board-zoom" role="group" aria-label="Масштаб поля"><button onClick={()=>zoomBy(.8)} aria-label="Приблизить">+</button><button onClick={()=>setView(null)} aria-label="Показать всё поле" title="Всё поле (двойной щелчок по полю)">⤢</button><button onClick={()=>zoomBy(1.25)} aria-label="Отдалить">−</button></div>
 {hovered&&<div className="province-hint" aria-hidden="true"><b>{hovered.name}</b><span>{hovered.owner!==null?`Контроль: ${s.players[hovered.owner].name}${hovered.control?` · открытых жетонов +${hovered.control}`:''}`:'Без владельца'}</span><span>Честь {hovered.honor} · защита {provinceDefense(s,hovered.id)}{hovered.special?` · ${specialText(hovered.special)}`:''}</span></div>}
 <div className="art-board-viewport" ref={box}>
 <svg ref={svg} className={`board-plane ${pan.current?.moved?'panning':''}`} viewBox={`${v.cx-v.w/2} ${v.cy-vh/2} ${v.w} ${vh}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Игровое поле Рокугана"
  onPointerDown={e=>{if(e.button!==0)return;pan.current={x:e.clientX,y:e.clientY,view:v,moved:false,id:e.pointerId};suppressClick.current=false;}}
  onPointerMove={e=>{const d=pan.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!d.moved&&Math.hypot(dx,dy)<5)return;if(!d.moved){d.moved=true;e.currentTarget.setPointerCapture(e.pointerId);}suppressClick.current=true;const k=d.view.w/Math.max(1,size.w);setView(clampView({...d.view,cx:d.view.cx-dx*k,cy:d.view.cy-dy*k}));}}
  onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);pan.current=null;setTimeout(()=>{suppressClick.current=false;},0);}}
  onPointerCancel={()=>{pan.current=null;suppressClick.current=false;}}
  onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();}}}
  onDoubleClick={()=>setView(null)}>
 <defs><marker id="attack-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#fff2ac"/></marker></defs>
 <image href="/art/board.webp" width={W} height={H}/>
 {/* Провинции: контур по скану. Владение — заливка цветом клана; наведение — светлая обводка. */}
 <g className="regions">{Object.values(s.provinces).map(p=>{const poly=regions[p.id];if(!poly)return null;const clan=p.owner!==null?s.players[p.owner].clan:undefined,canPick=!selecting||allowed(p.id),dim=highlightedPlayer!==null&&p.owner!==highlightedPlayer;
  return <path key={p.id} d={regionPath(poly)} className={`region ${clan?'owned':''} ${target===p.id?'sel':''} ${selecting&&canPick?'can':''} ${selecting&&!canPick?'cannot':''} ${focus===p.id?'resolving':''} ${dim?'dim':''} ${highlightedPlayer!==null&&!dim?'mine':''}`} style={{['--owner' as string]:clan?clanColors[clan]:'transparent'}} onMouseEnter={()=>setHoverProvince(p.id)} onMouseLeave={()=>setHoverProvince(h=>h===p.id?'':h)} onClick={()=>{if(canPick)pick(p.id);}}/>;})}</g>
 {Object.values(s.provinces).map(p=>{const pt=points[p.id],clan=p.owner!==null?s.players[p.owner].clan:undefined,canPick=!selecting||allowed(p.id);return <g key={p.id} transform={`translate(${pt.x} ${pt.y})`} style={{opacity:highlightedPlayer!==null&&p.owner!==highlightedPlayer?.35:1}} className={`province-pin ${focus===p.id?'resolving':''} ${selecting&&!canPick?'unavailable':''}`} role={canPick?'button':undefined} tabIndex={canPick?0:undefined} aria-label={`${p.name}: ${p.owner!==null?s.players[p.owner].name:'свободна'}`} onMouseEnter={()=>setHoverProvince(p.id)} onClick={()=>{if(canPick)pick(p.id);}} onKeyDown={e=>{if(canPick)keyAction(e,()=>pick(p.id));}}>
 <title>{p.name} · честь {p.honor} · защита {provinceDefense(s,p.id)}</title>
 <g opacity={s.orders.some(o=>o.target===p.id&&!o.from)?.35:1}><ControlPiece clan={clan} control={p.control}/></g>
 {p.special&&<g className="piece-enter" key={`${p.special.kind}-${'value' in p.special?p.special.value:''}`} transform="translate(21 -17)"><SpecialToken special={p.special} size={27}/></g>}
 </g>;})}
 {ghosts.map(o=>renderOrder(o,true))}{s.orders.filter(o=>!o.parent).sort((a,b)=>Number(!!a.from)-Number(!!b.from)||Number(s.orders.some(x=>x.parent===a.id))-Number(s.orders.some(x=>x.parent===b.id))).map(o=>renderOrder(o))}
 {selecting&&LAND_BORDERS.filter(([a,b])=>allowed(String(a),String(b))||allowed(String(b),String(a))).map(([a,b,x0,y0])=>{const {x,y}=borderAt(a,b,x0,y0);return <g key={`${a}-${b}`} className="border-pick" role="button" tabIndex={0} aria-label={`Граница ${a} — ${b}`} onClick={()=>pickBorder(String(a),String(b),x,y)} onKeyDown={e=>keyAction(e,()=>pickBorder(String(a),String(b),x,y))}><circle cx={x} cy={y} r="10"/><path d={`M${x-4} ${y}h8 M${x} ${y-4}v8`}/></g>;})}
 {selecting&&Object.entries(SEA_BORDERS).filter(([id])=>allowed(id,'sea')).map(([id,p])=><g key={id} className="border-pick sea-pick" role="button" tabIndex={0} aria-label={`Морская граница ${id}`} onClick={()=>pick(id,'sea')} onKeyDown={e=>keyAction(e,()=>pick(id,'sea'))}><circle cx={p.x} cy={p.y} r="11"/><text x={p.x} y={p.y+4} textAnchor="middle">≈</text></g>)}
 {selecting&&options.filter(p=>p.parent).map(p=>{const o=s.orders.find(o=>o.id===p.parent);if(!o)return null;const pt=position(o);return <g key={p.parent} className="border-pick blessing-pick" role="button" tabIndex={0} aria-label={`Благословить ${p.parent}`} onClick={()=>onOrder(p.parent!)} onKeyDown={e=>keyAction(e,()=>onOrder(p.parent!))}><circle cx={pt.x+25} cy={pt.y-20} r="10"/><text x={pt.x+25} y={pt.y-16} textAnchor="middle">✦</text></g>;})}
 {edge&&selecting&&<g className="direction-picker">{[[edge.a,edge.b],[edge.b,edge.a]].map(([dest,source])=>{const pt=points[dest],angle=Math.atan2(pt.y-edge.y,pt.x-edge.x),x=edge.x+Math.cos(angle)*32,y=edge.y+Math.sin(angle)*32,enabled=allowed(dest,source);return <g key={dest} className={enabled?'direction enabled':'direction disabled'} role="button" aria-disabled={!enabled} tabIndex={enabled?0:-1} aria-label={`Направить в ${s.provinces[dest].name}`} onClick={()=>{if(enabled)pick(dest,source);}} onKeyDown={e=>{if(enabled)keyAction(e,()=>pick(dest,source));}} transform={`translate(${x} ${y}) rotate(${angle*180/Math.PI})`}><circle r="15"/><path d="M-8 -4H1V-9L11 0L1 9V4H-8Z"/></g>;})}</g>}
 {selecting&&target&&from&&<line x1={from==='sea'?(SEA_BORDERS[target]?.x??points[target].x+40):points[from].x} y1={from==='sea'?(SEA_BORDERS[target]?.y??points[target].y):points[from].y} x2={points[target].x} y2={points[target].y} stroke="#fff2ac" strokeWidth="2" strokeDasharray="5 5" markerEnd="url(#attack-arrow)" pointerEvents="none"/>}
 <circle cx={235+(round-1)*33} cy="841" r="14" fill="none" stroke="#fff3b0" strokeWidth="4"/>
 </svg></div></div>;
}
export function specialText(sp:Special){return sp.kind==='honor'?`+${sp.value} чести`:sp.kind==='defense'?`+${sp.value} защиты и +1 чести`:specialNames[sp.kind];}
const specialArt:Record<string,string>={peace:'peace',scorched:'scorched',shrine:'shrine',harbor:'harbor'};
/** Особый жетон на поле: скан, если он есть; иначе нарисованный жетон того же вида. */
export function SpecialToken({special,size=26}:{special:Special;size?:number}){
 const art=special.kind==='honor'&&[1,2,4].includes(special.value)?`honor${special.value}`:specialArt[special.kind];
 const half=size/2;
 return <g className="special-token"><title>{specialText(special)}</title>
  {art?<image href={`/art/specials/${art}.webp`} x={-half} y={-half} width={size} height={size}/>:
   special.kind==='honor'?<g><circle r={half} fill="#ead9b6" stroke="#6b5130" strokeWidth="1.5"/><path d="M0 -8l2.3 4.8 5.2.6-3.8 3.6 1 5.2L0 3.7l-4.7 2.5 1-5.2-3.8-3.6 5.2-.6Z" fill="#e3b93b" stroke="#6b5130" strokeWidth=".8" transform="translate(0 -1) scale(.85)"/><text y={half-2} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#3b2a14">+{special.value}</text></g>:
   special.kind==='defense'?<g><path d={`M0 ${-half}L${half} ${-half*.6}V${half*.1}Q${half} ${half*.8} 0 ${half}Q${-half} ${half*.8} ${-half} ${half*.1}V${-half*.6}Z`} fill="#c9d5df" stroke="#2f4250" strokeWidth="1.5"/><text y="4" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1f2e38">+{special.value}</text></g>:
   <g>{/* Поле битвы: скрещённые мечи на бумажном квадрате, как на ширме */}<rect x={-half} y={-half} width={size} height={size} rx={size*.18} fill="#efe1bd" stroke="#6b5130" strokeWidth="1.2"/><g stroke="#3a2c1c" strokeWidth={size*.07} strokeLinecap="round" fill="none"><path d={`M${-half*.62} ${-half*.62}L${half*.62} ${half*.62}M${half*.62} ${-half*.62}L${-half*.62} ${half*.62}`}/><path d={`M${-half*.3} ${half*.62}L${-half*.62} ${half*.3}M${half*.3} ${half*.62}L${half*.62} ${half*.3}`} stroke="#8e2f28"/></g></g>}
 </g>;
}
/** Защита владельца без приказов: печатная, открытые жетоны контроля (у Краба по 3) и бонус защиты. */
export function provinceDefense(s:PlayerView,id:string){const p=s.provinces[id],crab=p.owner!==null&&s.players[p.owner].clan==='crab';return p.defense+p.control*(crab?3:1)+(p.special?.kind==='defense'?p.special.value:0);}
/** Фишки контроля: закрытый жетон с гербом и стопка открытых «+1» под ним (как на настоящем поле). */
function ControlPiece({clan,control}:{clan?:string;control:number}){
 const previous=useRef(clan),[old,setOld]=useState<string>();
 useEffect(()=>{const prior=previous.current;previous.current=clan;if(prior===clan)return;setOld(prior);if(!prior)return;const timer=setTimeout(()=>setOld(undefined),500);return()=>clearTimeout(timer);},[clan]);
 const size=20,h=size/2,shown=Math.min(control,3);
 return <>{old&&<g className="piece-exit"><image href={`/art/emblems/${old}.webp`} x={-h} y={-h} width={size} height={size}/></g>}{clan?<g key={`${clan}-${control}`} className="piece-enter control-piece">
  {Array.from({length:shown},(_,i)=><image key={i} href={`/art/controls/${clan}-open.webp`} x={-h+(shown-i)*3.2} y={-h+(shown-i)*3.2} width={size} height={size}/>)}
  <image href={`/art/emblems/${clan}.webp`} x={-h} y={-h} width={size} height={size}/>
  {control>0&&<g transform={`translate(${h+shown*3.2} ${h+shown*3.2-2})`}><rect x="-8" y="-6" width="16" height="11" rx="5.5" fill="#101a1fdd" stroke="#f1d58e" strokeWidth=".8"/><text textAnchor="middle" y="2.6" className="pin-count">+{control}</text></g>}
 </g>:null}</>;
}
