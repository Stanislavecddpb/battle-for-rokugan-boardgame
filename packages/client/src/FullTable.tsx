import {Children,isValidElement,type ReactNode,createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Client} from 'boardgame.io/client';
import {Local,SocketIO} from 'boardgame.io/multiplayer';
import {BattleForRokugan,CLANS,CARDS,OBJECTIVES,availablePlacements,tokenLegal,placementError,score,type FullState,type Action,type Clan,type Token,type Placement,type PlayerView} from '@rokugan/engine';

import {SERVER,type Session,type RoomPlayer} from './net';
import {useCardPlay} from './CardPlay';
import {WaitingLobby} from './WaitingLobby';
import {FinalResults} from './FinalResults';
import {ArtBoard} from './ArtBoard';
import {createPortal} from 'react-dom';
import {Emblem,TokenArt,CardArt,ArtZoom,HoverToken,clanColors} from './Art';
import {ClanBrief,ScreenDialog,TokenGuide,SpecialGuide,ClanTable} from './Screen';
const OrderPick=createContext<{request:(label:string,fn:(id:string)=>void)=>void}>({request:()=>{}});
const MapPick=createContext<{request:(label:string,fn:(id:string)=>void)=>void}>({request:()=>{}});
export const colors=['#315e91','#a63e34','#80672b','#755891','#38705e'];
export const tokenLabels:Record<string,string>={army:'Армия',navy:'Флот',shinobi:'Синоби',blessing:'Благословение',raid:'Набег',diplomacy:'Дипломатия',bluff:'Блеф'};
const specialLabels:Record<string,string>={peace:'Мир',scorched:'Выжжено',shrine:'Святилище',battlefield:'Поле битвы',harbor:'Порт',honor:'Честь',defense:'Защита'};
const phaseLabels:Record<string,string>={lobby:'Сбор игроков',clan:'Выбор кланов',objective:'Тайная цель',draft:'Начальные владения',dragon:'Выбор Дракона',upkeep:'Карты территорий',placement:'Расстановка приказов',unicorn:'Манёвр Единорога',reveal:'Раскрытие приказов',resolution:'Итоги раунда',finished:'Итоги партии'};
const tokenName=(t:Token)=>`${tokenLabels[t.kind]}${t.strength?' '+t.strength:''}`;
type Send=(a:Action)=>void;

export function FullTable({session,exit,members,onLeave}:{session:Session;exit:()=>void;members?:RoomPlayer[];onLeave?:()=>void}){
 const clients=useMemo(()=>{
  const multiplayer=session.matchID?SocketIO({server:SERVER}):Local({persist:true,storageKey:'rokugan:full:v1'});
  return (session.matchID?[session.watch?undefined:session.playerID!]:Array.from({length:session.players},(_,i)=>String(i))).map(playerID=>Client({game:BattleForRokugan,numPlayers:session.players,playerID,multiplayer,matchID:session.matchID??session.localID??'local-full',credentials:session.credentials,debug:false}));
 },[session]);
 const devNoCurtain=import.meta.env.DEV&&new URLSearchParams(location.search).has('nocurtain');
 const [tick,setTick]=useState(0),[viewer,setViewer]=useState(session.watch?'spectator':session.playerID??'0'),[curtain,setCurtain]=useState(!session.matchID&&!devNoCurtain),[error,setError]=useState('');
 const [highlightedPlayer,setHighlightedPlayer]=useState<string|null>(null);
 const [unicornIds,setUnicornIds]=useState<string[]>([]),[requestedCard,setRequestedCard]=useState(''),[orderPick,setOrderPick]=useState<{label:string;fn:(id:string)=>void}|null>(null),[target,setTarget]=useState(''),[showHelp,setShowHelp]=useState(false),[from,setFrom]=useState(''),[chosenToken,setChosenToken]=useState(''),[selectedOrder,setSelectedOrder]=useState(''),[screenOpen,setScreenOpen]=useState(false),[mapPick,setMapPick]=useState<{label:string;fn:(id:string)=>void}|null>(null);
 useEffect(()=>{const unsubs=clients.map(c=>{c.start();return c.subscribe(()=>setTick(n=>n+1));});return ()=>{unsubs.forEach(f=>f());clients.forEach(c=>c.stop());};},[clients]);
 const client=clients.find(c=>c.playerID===viewer)??clients[0],state=client.getState(),g=state?.G as FullState|undefined;
 useEffect(()=>setHighlightedPlayer(null),[viewer]);
 const turn=g?.active,phase=g?.phase,commandRef=useRef<HTMLElement>(null);

 useEffect(()=>{commandRef.current?.scrollTo({top:0});},[turn,phase,g?.pending?.kind]);
 useEffect(()=>{setTarget('');setFrom('');setChosenToken('');setSelectedOrder('');setMapPick(null);setOrderPick(null);setRequestedCard('');setUnicornIds([]);setError('');if(!session.matchID&&turn){setViewer(turn);setCurtain(!devNoCurtain&&phase!=='reveal'&&phase!=='resolution');}},[turn,phase,session.matchID]);
 const flow=useCardPlay(g,viewer,a=>client.moves.act(a));
 // Стол занимает ровно экран; лобби и шторка прокручиваются как обычные страницы.
 const tableShown=!!g&&g.phase!=='lobby'&&!(curtain&&!session.matchID&&g.phase!=='finished'&&g.phase!=='reveal'&&g.phase!=='resolution');
 useEffect(()=>{if(!tableShown)return;document.documentElement.classList.add('rk-fullscreen');return()=>document.documentElement.classList.remove('rk-fullscreen');},[tableShown]);
 useDevAutoplay(g,clients,!!session.matchID);
 if(!g||!state)return <main className="landing"><h1>Подключение…</h1><button onClick={exit}>Назад</button></main>;
 const s=g.round as unknown as PlayerView,me=s.players[viewer]??{name:'Зритель',hand:[],scouts:0,shugenja:0,clan:undefined},active=!session.watch&&g.active===viewer,over=g.phase==='finished';
 const secret=g.secrets[viewer]??{objective:null,objectives:[],intel:[],aside:[],pool:[]};
 const send:Send=a=>{setError('');client.moves.act(a);};
 if(g.phase==='lobby')return <WaitingLobby onAction={(a,id)=>{(session.matchID?client:clients.find(c=>c.playerID===(id??viewer))??client).moves.act(a);}} g={g} session={session} members={members} exit={exit} onReady={()=>send({type:'ready',ready:true,name:members?.find(p=>String(p.id)===viewer)?.name??me.name})} onStart={()=>{if(!session.matchID){for(const c of clients)c.moves.act({type:'ready',ready:true,name:`Игрок ${Number(c.playerID)+1}`});clients[0].moves.act({type:'start'});}else send({type:'start'});}} onLeave={onLeave?()=>{send({type:'ready',ready:false});onLeave();}:undefined}/>;
 if(curtain&&!session.matchID&&!over&&g.phase!=='reveal'&&g.phase!=='resolution')return <div className="curtain" role="dialog" aria-modal="true" aria-label="Передача устройства"><span className="seal">六</span><h2>Передайте устройство<br/>{s.players[g.active].name}</h2><p>{phaseLabels[g.phase]} · {g.phase==='draft'?`Осталось выбрать провинций: ${g.draft[g.active]}`:`Раунд ${g.number} из 5`}</p><button autoFocus className="primary" onClick={()=>setCurtain(false)}>Открыть мою ширму</button><button className="exit-game" onClick={exit}>Сохранить и выйти</button></div>;
 const orderName=(id:string)=>{const o=s.orders.find(o=>o.id===id);return o?`${s.players[o.player].name}: ${s.provinces[o.target].name} · ${o.token?tokenName(o.token):'закрыт'}`:'Снятый приказ';};
 const picked=target?s.provinces[target]:null;
 const mapState={...s,orders:g.phase==='reveal'?s.orders:s.revealed?[]:s.orders};
 const returning=flow.playing&&flow.step==='placement'?s.discarded.find(t=>t.id===flow.draft?.discard[0]):undefined;
 const selectedToken=returning??me.hand.find(t=>t.id===chosenToken);
 const placementState=returning?{...g,round:{...g.round,players:{...g.round.players,[viewer]:{...g.round.players[viewer],hand:[returning]}}}}:g;
 const options=g.phase==='draft'?Object.values(s.provinces).filter(p=>p.owner===null).map(p=>({token:'',target:p.id})):selectedToken?availablePlacements(placementState,viewer).filter(p=>p.token===selectedToken.id&&(!returning||!!p.parent||tokenLegal(placementState.round,{...p,id:'preview',player:viewer,token:returning}))):[];
 const handCount=me.hand.length,myDiscard=s.discarded.filter(t=>t.owner===viewer);
 const cardPick=active&&!g.pending?(id:string)=>{setOrderPick(null);setChosenToken('');flow.preview(id);}:undefined;
 return <OrderPick.Provider value={{request:(label,fn)=>{flow.cancel();setChosenToken('');setOrderPick({label,fn});}}}><MapPick.Provider value={{request:(label,fn)=>setMapPick({label,fn})}}><main className="table full-table rk" data-phase={g.phase} data-revision={tick}>
  {showHelp&&<RulesDialog onClose={()=>setShowHelp(false)}/>}
  {screenOpen&&me.clan&&<ScreenDialog clan={me.clan} onClose={()=>setScreenOpen(false)}/>}
  {/* Левая колонка — моя ширма: то, что видит только этот игрок. */}
  <aside className="rk-left" aria-label="Моя ширма">
   <header className="rk-round"><span className="eyebrow">Битва за Рокуган</span><b>Раунд {g.number} из 5</b><small>{phaseLabels[g.phase]}{!over&&` · ходит ${s.players[g.active].name}`}</small><RoundDots round={g.number}/></header>
   {session.watch?<p className="muted">Вы наблюдаете: руки и цели игроков скрыты.</p>:<>
   {me.clan&&<button className="screen-button" onClick={()=>setScreenOpen(true)} style={{['--clan' as string]:clanColors[me.clan]}}><Emblem clan={me.clan}/><span><b>Ширма · {me.name}</b><small>{CLANS[me.clan as Clan].ability}</small></span></button>}
   <section className="rk-block"><h3>Мои карты</h3><PlayerCards key={viewer} g={g} id={viewer} onCard={cardPick} onSupport={active&&g.phase==='placement'&&!g.pending?cardPick:undefined} selected={flow.draft?.id}/></section>
   {secret.objective&&<section className="rk-block objective-block"><h3>Тайная цель · {OBJECTIVES[secret.objective].points} чести</h3><div className="objective-row"><CardArt type="objective" id={secret.objective} name={OBJECTIVES[secret.objective].name}/><p><b>{OBJECTIVES[secret.objective].name}</b>{OBJECTIVES[secret.objective].description}</p></div></section>}
   <section className="rk-block pools"><h3>Резерв · {secret.pool.length}</h3><TokenRow clan={me.clan} tokens={secret.pool} empty="Резерв пуст"/>
    <h3>Сброс · {myDiscard.length}</h3><div className="discard-tokens">{myDiscard.length?myDiscard.map(t=><HoverToken key={t.id} clan={me.clan} token={t}><button className={flow.playing&&flow.step==='discard'?'pickable':''} disabled={!(flow.playing&&flow.step==='discard')} onClick={()=>flow.token(t.id)} aria-label={tokenName(t)}><TokenArt clan={me.clan} token={t}/></button></HoverToken>):<small className="muted">Пусто</small>}</div></section>
   </>}
  </aside>
  <section className="rk-board" aria-label="Поле">
   {session.matchID&&!state.isConnected&&<p role="alert" className="notice floating-notice">Связь с сервером потеряна. Восстанавливаем подключение…</p>}
   <ArtBoard highlightedPlayer={highlightedPlayer} s={mapState} target={target} from={from} onPosition={(id,source='')=>{if(flow.province(id,source))return;setTarget(id);setFrom(source);if(mapPick){mapPick.fn(id);setMapPick(null);}}} round={g.number} viewer={viewer} provinceTargeting={flow.playing&&['province','sacrifice'].includes(flow.step??'')} selecting={!!returning||!flow.playing&&!orderPick&&g.phase!=='unicorn'&&(!!chosenToken||!!g.manual&&!!selectedOrder||g.phase==='draft'&&active)} manual={!!g.manual} options={options} selectedOrders={unicornIds} selectedOrder={selectedOrder} onOrder={id=>{if(g.pending?.kind==='dark'&&g.pending.player===viewer){if(g.pending.ids.includes(id))send({type:'pending',order:id});return;}if(flow.order(id))return;setSelectedOrder(id);if(g.phase==='unicorn'&&active){const o=s.orders.find(o=>o.id===id);if(o?.player===viewer&&!o.parent&&!s.orders.some(x=>x.parent===id))setUnicornIds(old=>old.includes(id)?old.filter(x=>x!==id):old.length<2?[...old,id]:old);else setError('Выберите свой приказ без благословения.');}if(orderPick){orderPick.fn(id);setOrderPick(null);}}} focus={g.replay?.steps[g.replay.cursor]}/>
   {(orderPick||mapPick)&&<p className="map-prompt" role="status">{orderPick?`${orderPick.label}: нажмите закрытый приказ на поле.`:`${mapPick!.label}: нажмите провинцию на поле.`} <button onClick={()=>{setOrderPick(null);setMapPick(null);}}>Отмена</button></p>}
   <Flash g={g}/>
   {over&&<div className="rk-final"><FinalResults g={g}/></div>}
  </section>
  <aside className="rk-right">
   <div className="rk-players">{Object.entries(s.players).map(([id])=><PlayerRow key={id} g={g} id={id} viewer={viewer} nickname={members?.find(m=>String(m.id)===id)?.name??g.lobby?.names[id]??`Игрок ${+id+1}`} targeting={flow.playing&&flow.step==='player'} onPick={()=>flow.player(id)} onHover={on=>setHighlightedPlayer(on?id:null)}/>)}</div>
   <section className="panel command" ref={commandRef}>
   <h2>{session.watch?'Наблюдение за партией':over?'Партия завершена':active?`Ваш ход · ${me.name}`:`Ожидание: ${s.players[g.active].name}`}</h2>
   {flow.panel}{flow.spyPanel}
   {g.phase==='reveal'&&<RevealPanel g={g} active={active} send={send}/>}
   {!session.watch&&g.manual&&['draft','dragon','upkeep','placement','resolution','unicorn'].includes(g.phase)&&<ManualPanel g={g} viewer={viewer} target={target} from={from} order={selectedOrder} send={send}/>}
   <div role="alert" className="error">{!flow.playing&&(g.errors[viewer]||error)}</div>
   {active&&!over&&<div key={`${g.phase}-${g.active}-${g.pending?.kind??''}`}>
    {g.pending?<Pending g={g} viewer={viewer} send={send} orderName={orderName}/>:
     g.phase==='clan'?<div className="clan-options">{Object.entries(CLANS).map(([id,c])=><button key={id} disabled={Object.values(s.players).some(p=>p.clan===id)} onClick={()=>send({type:'clan',clan:id})}><Emblem clan={id}/><div><b>{c.name}</b><small>{c.ability}</small></div></button>)}</div>:
     g.phase==='objective'?<>{secret.objectives.map(id=><div className="objective-choice" key={id}><CardArt type="objective" id={id} name={OBJECTIVES[id].name}/><b>{OBJECTIVES[id].name}</b><p>{OBJECTIVES[id].description}</p><button onClick={()=>send({type:'objective',objective:id})}>Выбрать · {OBJECTIVES[id].points} чести</button></div>)}</>:
     g.phase==='draft'?<><p>Выберите свободную провинцию на карте. Осталось: {g.draft[viewer]}.</p><button className="primary" disabled={!picked||picked.owner!==null} onClick={()=>send({type:'draft',province:target})}>Занять {picked?.name??'провинцию'}</button></>:
     g.phase==='dragon'?<><p>Верните один жетон в резерв.</p><div className="hand">{me.hand.map(t=><button key={t.id} onClick={()=>send({type:'dragon',token:t.id})}><TokenArt clan={me.clan} token={t}/><span>{tokenName(t)}</span></button>)}</div></>:
     g.phase==='upkeep'?<><p className="turn-instruction">Разыграйте карту территории (слева, «Мои карты») или передайте ход. После паса всех игроков начинается расстановка.</p><button className="primary" disabled={flow.playing} onClick={()=>send({type:'pass'})}>Пас · {g.passes} из {g.seats.length}</button><HandView clan={me.clan} hand={me.hand}/></>:
     g.phase==='placement'?<><p className="turn-instruction">Жетон → место на поле → «Разместить». В руке остаётся один жетон.</p><PlacementForm cardMode={flow.playing} handPick={flow.playing&&flow.step==='hand'?flow.token:undefined} g={g} viewer={viewer} send={send} target={target} setTarget={setTarget} from={from} setFrom={setFrom} token={chosenToken} setToken={setChosenToken} selectedOrder={selectedOrder}/></>:
     g.phase==='unicorn'?<Unicorn ids={unicornIds} setIds={setUnicornIds} g={g} viewer={viewer} send={send} orderName={orderName}/>:
     g.phase==='resolution'?<><h3>Раунд завершён</h3><p>Контроль и карты территорий обновлены. Бои — в журнале ниже.</p><button className="primary" onClick={()=>send({type:'continue'})}>Начать раунд {g.number+1}</button></>:null}
   </div>}
   {!active&&g.manual&&g.phase==='placement'&&!session.watch&&<PlacementForm handPick={flow.playing&&flow.step==='hand'?flow.token:undefined} g={g} viewer={viewer} send={send} target={target} setTarget={setTarget} from={from} setFrom={setFrom} token={chosenToken} setToken={setChosenToken} selectedOrder={selectedOrder}/>}
   {!active&&!over&&!g.manual&&!session.watch&&<HandView clan={me.clan} hand={me.hand} title={`Рука · ${handCount}`}/>}
   {picked&&<p className="province-detail"><b>{picked.name}</b> · {picked.owner===null?'нет владельца':`контроль: ${s.players[picked.owner].name}`} · {picked.coastal||picked.special?.kind==='harbor'?'прибрежная':'внутренняя'} · соседи: {picked.neighbors.map(id=>s.provinces[id].name).join(', ')}</p>}
   </section>
   <LogPanel log={g.log}/>
   <footer className="rk-tools">{session.matchID&&<span>Комната <b>{session.matchID}</b></span>}<button onClick={()=>setShowHelp(true)}>Правила</button>{!session.watch&&!over&&<button aria-pressed={!!g.manual} onClick={()=>send({type:'mode',enabled:!g.manual})} title="Свободное редактирование поля в обход правил">{g.manual?'К правилам':'Ручной режим'}</button>}<button className="exit-game" onClick={exit}>Выйти</button></footer>
  </aside>
 </main></MapPick.Provider></OrderPick.Provider>;
}

function RoundDots({round}:{round:number}){return <span className="round-dots" aria-hidden="true">{[1,2,3,4,5].map(n=><i key={n} className={n<round?'done':n===round?'now':''}/>)}</span>;}
function TokenRow({clan,tokens,empty}:{clan?:string;tokens:Token[];empty:string}){
 if(!tokens.length)return <small className="muted">{empty}</small>;
 const groups=new Map<string,{t:Token;n:number}>();for(const t of tokens){const k=`${t.kind}-${t.strength}`;const v=groups.get(k);if(v)v.n++;else groups.set(k,{t,n:1});}
 return <div className="token-row">{[...groups.values()].sort((a,b)=>a.t.kind.localeCompare(b.t.kind)||a.t.strength-b.t.strength).map(({t,n})=><HoverToken key={`${t.kind}-${t.strength}`} clan={clan} token={t}><TokenArt clan={clan} token={t}/>{n>1&&<b>×{n}</b>}</HoverToken>)}</div>;
}
function HandView({clan,hand,title='Рука'}:{clan?:string;hand:Token[];title?:string}){return <div className="hand-view"><h3>{title}</h3><div className="hand">{hand.map(t=><HoverToken className="private-token" key={t.id} clan={clan} token={t}><TokenArt clan={clan} token={t}/>{tokenName(t)}</HoverToken>)}</div></div>;}
/** Строка игрока справа. Наведение — карточка со способностью клана, уникальным жетоном и картами. */
function PlayerRow({g,id,viewer,nickname,targeting,onPick,onHover}:{g:FullState;id:string;viewer:string;nickname:string;targeting:boolean;onPick:()=>void;onHover:(on:boolean)=>void}){
 const s=g.round,p=s.players[id],[tip,setTip]=useState<{top:number;right:number}|null>(null),hide=useRef<ReturnType<typeof setTimeout>>();
 const provinces=Object.values(s.provinces).filter(x=>x.owner===id),open=provinces.reduce((n,x)=>n+x.control,0),discard=s.discarded.filter(t=>t.owner===id).length;
 const cards=g.cards.filter(c=>c.owner===id&&!c.used);
 const place=(el:HTMLElement)=>{clearTimeout(hide.current);const r=el.getBoundingClientRect();setTip({top:Math.max(8,Math.min(r.top,innerHeight-460)),right:innerWidth-r.left+6});};
 // Подсказку можно «поймать» мышью: карты в ней увеличиваются при наведении.
 const leave=()=>{hide.current=setTimeout(()=>{setTip(null);onHover(false);},220);};
 return <div role="button" tabIndex={0} className={`rk-player ${id===g.active?'active':''} ${targeting?'player-target':''}`} style={{['--clan' as string]:clanColors[p.clan??'']??colors[+id]}} aria-label={targeting?`Выбрать игрока: ${p.name}`:`${p.name}: подробнее`}
  onMouseEnter={e=>{place(e.currentTarget);onHover(true);}} onMouseLeave={leave} onFocus={e=>place(e.currentTarget)} onBlur={()=>setTip(null)}
  onClick={onPick} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onPick();}}>
  <Emblem clan={p.clan}/>
  <div className="who"><b>{p.name}{id===viewer?' · вы':''}{id===g.first&&<span className="first-mark" title="Первый игрок"> ①</span>}</b><small>{nickname}{p.ronin?' · ронин':''}</small></div>
  <div className="stats"><span title="Честь по текущему контролю"><b>{score(s.provinces,id).total}</b> чести</span><span title="Провинции под контролем · открытые жетоны контроля">{provinces.length} пров.{open?` · +${open}`:''}</span><span title="Жетоны: в руке · в резерве · в сбросе">✋{(p as unknown as {handCount:number}).handCount} ◫{g.reserve?.[id]??'—'} ✕{discard}</span></div>
  {tip&&p.clan&&createPortal(<div className="player-tip" style={{top:tip.top,right:tip.right}} onMouseEnter={()=>{clearTimeout(hide.current);onHover(true);}} onMouseLeave={leave}><ClanBrief clan={p.clan} owner={id}><div className="tip-cards"><small>Карты: {cards.length+p.scouts+p.shugenja} · наведите, чтобы прочитать</small><div>{cards.map(c=>{const card=CARDS.find(x=>x.id===c.id);return c.id?<ArtZoom key={c.territory} src={`/art/cards/${c.id}.webp`} title={card?.name??c.id} description={card?.description}><img src={`/art/cards/${c.id}.webp`} alt={card?.name}/></ArtZoom>:<img key={c.territory} src="/art/cards/territory-back.png" alt="Закрытая карта"/>;})}{Array.from({length:p.scouts},(_,i)=><ArtZoom key={'s'+i} src="/art/support/scout.webp" title="Разведчик" description="Тайно посмотрите чужой приказ без благословения."><img src="/art/support/scout.webp" alt="Разведчик"/></ArtZoom>)}{Array.from({length:p.shugenja},(_,i)=><ArtZoom key={'g'+i} src="/art/support/shugenja.webp" title="Сюгэндзя" description="Откройте и сбросьте чужой приказ без благословения."><img src="/art/support/shugenja.webp" alt="Сюгэндзя"/></ArtZoom>)}</div></div></ClanBrief></div>,document.body)}
 </div>;
}
/** Публичный сброс жетона картой или способностью — показывается всем крупно на несколько секунд. */
function Flash({g}:{g:FullState}){
 const first=useRef(g.flash?.id),[shown,setShown]=useState<FullState['flash']|null>(null);
 useEffect(()=>{if(!g.flash||g.flash.id===first.current)return;first.current=g.flash.id;setShown(g.flash);const t=setTimeout(()=>setShown(null),6000);return()=>clearTimeout(t);},[g.flash?.id]);
 if(!shown)return null;
 return <div className="flash" role="status" onClick={()=>setShown(null)}><div className="flash-tokens">{shown.tokens.map((x,i)=><TokenArt key={i} clan={g.round.players[x.owner]?.clan} token={x.token}/>)}</div><p>{shown.text}</p></div>;
}
const LOG_KEY='rokugan:log-open';
/** Единый журнал: ходы, карты, сбросы, снятые приказы и бои. Свежие строки сверху. */
function LogPanel({log}:{log:string[]}){
 const [open,setOpen]=useState(()=>{try{return localStorage.getItem(LOG_KEY)!=='0';}catch{return true;}});
 const toggle=()=>{setOpen(!open);try{localStorage.setItem(LOG_KEY,open?'0':'1');}catch{/* приватный режим */}};
 return <section className={`rk-log ${open?'':'closed'}`}><button className="log-head" onClick={toggle} aria-expanded={open}>Журнал {open?'▾':'▸'}</button>{open?<div className="log-lines">{log.slice().reverse().map((line,i)=><p key={log.length-i} className={/^Бой за|^Снят|сброшен/.test(line)?'log-battle':/^Раунд/.test(line)?'log-round':''}>{line}</p>)}</div>:log.length>0&&<p className="log-last">{log[log.length-1]}</p>}</section>;
}

/** Только для разработки: ?autoplay=N доигрывает локальную партию до начала раунда N. */
function useDevAutoplay(g:FullState|undefined,clients:ReturnType<typeof Client>[],online:boolean){
 if(import.meta.env.DEV)(window as unknown as {__rk:unknown}).__rk=clients; // отладка из консоли
 const until=import.meta.env.DEV&&!online?Number(new URLSearchParams(location.search).get('autoplay')??0):0;
 useEffect(()=>{
  if(!until||!g)return;
  const by=(id:string)=>clients.find(c=>c.playerID===id)!,a=g.active,s=g.round;
  let action:Action|null=null;
  if(g.phase==='lobby'){const waiting=g.seats.find(id=>!g.lobby?.ready[id]);if(waiting){const t=setTimeout(()=>by(waiting).moves.act({type:'ready',ready:true,name:`Игрок ${Number(waiting)+1}`}),30);return ()=>clearTimeout(t);}action={type:'start'};}
  else if(g.phase==='objective')action={type:'objective',objective:(by(a).getState()?.G as FullState).secrets[a].objectives[0]};
  else if(g.phase==='draft'){const free=Object.values(s.provinces).filter(p=>p.owner===null&&!p.shadowlands),mine=(t:string)=>Object.values(s.provinces).filter(p=>p.owner===a&&p.territory===t).length;free.sort((x,y)=>mine(y.territory)-mine(x.territory));action={type:'draft',province:(free[0]??Object.values(s.provinces).find(p=>p.owner===null))!.id};}
  else if(g.phase==='dragon')action={type:'dragon',token:(by(a).getState()?.G as FullState).round.players[a].hand[0].id};
  else if(g.number>=until)return;
  else if(g.phase==='upkeep')action={type:'pass'};
  else if(g.phase==='placement'){const all=availablePlacements(by(a).getState()?.G as FullState,a),p=all.find(p=>!p.parent)??all[0];action=p?{type:'place',placement:p}:{type:'pass'};}
  else if(g.phase==='unicorn')action={type:'unicorn',ids:[]};
  else if(g.phase==='reveal')action={type:'reveal-next'};
  else if(g.phase==='resolution')action={type:'continue'};
  if(action){const t=setTimeout(()=>by(g.phase==='lobby'?'0':a).moves.act(action!),30);return ()=>clearTimeout(t);}
 },[g?.revision,g?.phase,g?.active]);
}
function PlacementForm({cardMode,handPick,g,viewer,send,target,setTarget,from,setFrom,token,setToken,selectedOrder}:{cardMode?:boolean;handPick?:(id:string)=>boolean;g:FullState;viewer:string;send:Send;target:string;setTarget:(v:string)=>void;from:string;setFrom:(v:string)=>void;token:string;setToken:(v:string)=>void;selectedOrder:string}){
 const [parent,setParent]=useState(''),[peek,setPeek]=useState(''),[peekError,setPeekError]=useState(''),orderPick=useContext(OrderPick);
 useEffect(()=>{const o=g.round.orders.find(o=>o.id===selectedOrder);if(o&&g.round.players[viewer].hand.find(t=>t.id===token)?.kind==='blessing'){setParent(o.id);setTarget(o.target);setFrom(o.from??'');}},[selectedOrder,token]);
 const s=g.round,p=s.players[viewer],input:Placement={token,target,...(from?{from}:{}),...(parent?{parent}:{})};
 const problem=token&&target?(g.manual?null:placementError(s,viewer,input)):'Выберите жетон и провинцию.';
 return <><div className="hand">{p.hand.map(t=><button key={t.id} disabled={cardMode&&!handPick} aria-pressed={token===t.id} onClick={()=>{if(handPick?.(t.id))return;if(token===t.id){setToken('');setTarget('');setFrom('');setParent('');setPeek('');return;}setToken(t.id);setParent('');}} title={token===t.id?'Нажмите ещё раз, чтобы отменить выбор':undefined}><TokenArt clan={p.clan} token={t}/><span>{tokenName(t)}</span></button>)}</div>
 {!cardMode&&<><p className="placement-direction">{target?`${from?from==='sea'?'С моря':s.provinces[from].name:'В центре'} → ${s.provinces[target].name}`:token?'Теперь нажмите подсвеченную точку на карте.':'Выберите жетон из руки.'}</p>
 {p.hand.find(t=>t.id===token)?.kind==='blessing'&&<p>Нажмите свой закрытый приказ на поле для благословения.</p>}
 {p.clan==='scorpion'&&!g.scorpionUsed&&!g.manual&&<section className="scorpion-ability"><button className="ability-card" aria-pressed={!!peek} onClick={()=>orderPick.request('Тайный взгляд Скорпиона',id=>{const o=s.orders.find(o=>o.id===id);if(!o||o.parent||s.orders.some(x=>x.parent===id)){setPeekError('Приказ с благословением защищён. Выберите другой.');return;}setPeek(id);setPeekError('');})}><img src="/art/emblems/scorpion.webp" alt=""/><b>Тайный взгляд</b><small>Выбрать приказ на поле</small></button><p>Выберите цель, затем разместите свой жетон. Результат увидите только вы. Один раз за раунд.</p>{peek&&<p role="status">Цель: {s.provinces[s.orders.find(o=>o.id===peek)!.target].name}. <button onClick={()=>setPeek('')}>Отменить</button></p>}{peekError&&<p role="alert">{peekError}</p>}</section>}
 {p.clan==='scorpion'&&g.scorpionUsed&&<p>Тайный взгляд уже использован в этом раунде.</p>}
 {token&&target&&problem&&<p role="status" className="placement-error">{problem}</p>}
 <button className="primary" disabled={!!problem} onClick={()=>{send({type:g.manual?'manual-place':'place',placement:input,...(peek?{peek}:{})});setToken('');}}>{peek?'Разместить и тайно посмотреть':'Разместить приказ'}</button></>}</>;
}
function Pending({g,viewer,send,orderName}:{g:FullState;viewer:string;send:Send;orderName:(id:string)=>string}){
 const [returns,setReturns]=useState<{token:string;to:'pool'|'discard'}[]>([]);
 const pending=g.pending!;
 if(pending.kind==='intel')return <><p>Просмотренный приказ открыт для вас на поле.</p><button onClick={()=>send({type:'pending'})}>Закрыть ширму и передать ход</button></>;
 if(pending.kind==='dark')return <p>Нажмите один из просмотренных приказов на поле, чтобы раскрыть и сбросить его.</p>;
 return <><p>Верните {pending.count} жетон(а) из руки.</p>{Array.from({length:pending.count},(_,i)=><div key={i}><label>Жетон {i+1}<Choices value={returns[i]?.token??''} onChange={e=>setReturns(old=>Array.from({length:pending.count},(_,j)=>j===i?{token:e.target.value,to:old[j]?.to??'pool'}:old[j]??{token:'',to:'pool'}))}><option value="">Выберите</option>{g.round.players[viewer].hand.map(t=><option key={t.id} value={t.id}>{tokenName(t)}</option>)}</Choices></label><label>Куда<Choices value={returns[i]?.to??'pool'} onChange={e=>setReturns(old=>Array.from({length:pending.count},(_,j)=>j===i?{token:old[j]?.token??'',to:e.target.value as 'pool'|'discard'}:old[j]??{token:'',to:'pool'}))}><option value="pool">В резерв</option><option value="discard">В сброс</option></Choices></label></div>)}<button disabled={returns.filter(r=>r.token).length!==pending.count||new Set(returns.map(r=>r.token)).size!==pending.count} onClick={()=>send({type:'pending',returns})}>Завершить обмен</button></>;
}
function Unicorn({g,viewer,send,orderName,ids,setIds}:{g:FullState;viewer:string;send:Send;orderName:(id:string)=>string;ids:string[];setIds:(ids:string[])=>void}){
 return <section className="unicorn-action"><span className="eyebrow">МАНЁВР ЕДИНОРОГА</span><h3>Выберите два жетона на поле</h3><p>Нажмите свои приказы без благословения. Нажатие на стопку открывает её содержимое.</p><div className="chosen-orders">{[0,1].map(i=><button key={i} disabled={!ids[i]} onClick={()=>setIds(ids.filter(id=>id!==ids[i]))}>{ids[i]?orderName(ids[i])+' ✕':`${i+1}. Нажмите жетон на карте`}</button>)}</div><p className="muted">Меняются жетоны, а не места приказов. Допустимость проверяется при раскрытии.</p><button className="primary" disabled={ids.length!==2} onClick={()=>send({type:'unicorn',ids})}>Обменять два жетона</button><button onClick={()=>send({type:'unicorn',ids:[]})}>Пропустить способность</button></section>;
}
function Choices({value,onChange,children}:{value:string;onChange:(e:{target:{value:string}})=>void;children:ReactNode}){return <span className="card-choices">{Children.toArray(children).filter(isValidElement).map((child:any)=>child.props.value?<button type="button" key={child.props.value} aria-pressed={value===child.props.value} onClick={()=>onChange({target:{value:child.props.value}})}>{child.props.children}</button>:<button type="button" key="empty" aria-pressed={!value} onClick={()=>onChange({target:{value:''}})}>{child.props.children}</button>)}</span>;}
function PlayerCards({g,id,onCard,onSupport,selected}:{g:FullState;id:string;onCard?:(id:string)=>void;onSupport?:(kind:string)=>void;selected?:string}){
 const p=g.round.players[id],cards=g.cards.filter(c=>c.owner===id&&!c.used);
 const supports=(['scout','shugenja','first'] as const).map(kind=>({kind,count:kind==='scout'?p.scouts:kind==='shugenja'?p.shugenja:g.first===id&&!g.firstUsed&&g.seats.length>2?1:0})).filter(x=>x.count>0);
 const supportName={scout:'Разведчик',shugenja:'Сюгэндзя',first:'Первый игрок'},supportText={scout:'Тайно посмотрите чужой приказ без благословения.',shugenja:'Откройте и сбросьте чужой приказ без благословения.',first:'Посмотрите приказ и верните его в резерв владельца.'};
 if(!cards.length&&!supports.length)return <small className="muted">Карт нет. Карты территорий получает тот, кто контролирует всю территорию.</small>;
 return <div className="card-grid">
  {cards.map(c=>{const playable=onCard&&(['north','south'].includes(c.territory)?g.phase==='placement':g.phase==='upkeep');return c.id?<CardArt selected={selected===c.id} onSelect={playable?()=>onCard!(c.id):undefined} key={c.territory} id={c.id} name={CARDS.find(x=>x.id===c.id)?.name??c.id}/>:<img key={c.territory} className="territory-card-back" src="/art/cards/territory-back.png" alt="Закрытая карта территории"/>;})}
  {supports.map(({kind,count})=><div className={`component-card support ${selected===kind?'selected':''}`} key={kind}><ArtZoom src={`/art/support/${kind}.webp`} title={supportName[kind]} description={supportText[kind]} onClick={onSupport?()=>onSupport(kind):undefined} label={onSupport?`Использовать: ${supportName[kind]}`:undefined}><img src={`/art/support/${kind}.webp`} alt={supportName[kind]} draggable={false}/></ArtZoom>{count>1&&<b className="card-count">×{count}</b>}</div>)}
 </div>;
}
function orderNameFor(g:FullState,o:FullState['round']['orders'][number]){return `${g.round.players[o.player].name} · ${g.round.provinces[o.target].name}`;}
function ManualPanel({g,viewer,target,from,order,send}:{g:FullState;viewer:string;target:string;from:string;order:string;send:Send}){
 const p=g.round.provinces[target],[control,setControl]=useState(0);
 useEffect(()=>setControl(p?.control??0),[target,p?.control]);
 const selected=g.round.orders.find(o=>o.id===order),canMove=!!selected;const [replacement,setReplacement]=useState('');
 return <details className="manual-panel" open><summary>Свободное управление</summary><p>Правки обходят игровые ограничения. После исправления нажмите «Вернуться к правилам».</p><button disabled={!g.canUndo} onClick={()=>send({type:'manual-undo'})}>Отменить последнее действие</button>{p?<><b>{p.name}</b><div className="owner-buttons"><button onClick={()=>send({type:'manual-control',province:target,owner:null,control:0})}>Без владельца</button>{g.seats.map(id=><button key={id} aria-pressed={p.owner===id} onClick={()=>send({type:'manual-control',province:target,owner:id,control})}><Emblem clan={g.round.players[id].clan}/>{g.round.players[id].name}</button>)}</div><label>Открытые жетоны контроля<input type="number" min="0" max="30" value={control} onChange={e=>setControl(Number(e.target.value))}/></label><button disabled={p.owner===null} onClick={()=>send({type:'manual-control',province:target,owner:p.owner,control})}>Применить укрепления</button></>:<p>Нажмите провинцию, чтобы изменить контроль.</p>}
 {canMove&&!g.round.revealed&&<><p>Приказ: {orderNameFor(g,selected!)}. Выберите новое место или границу на поле.</p><button disabled={!target} onClick={()=>send({type:'manual-move',order,placement:{token:'',target,...(from?{from}:{})}})}>Переместить сюда</button><button onClick={()=>send({type:'manual-return',order})}>Вернуть в руку</button>{selected?.player===viewer&&<div><p>Заменить жетоном из своей руки:</p><div className="hand">{g.round.players[viewer].hand.map(t=><button key={t.id} aria-pressed={replacement===t.id} onClick={()=>setReplacement(t.id)}><TokenArt clan={g.round.players[viewer].clan} token={t}/><span>{tokenName(t)}</span></button>)}</div><button disabled={!replacement} onClick={()=>{send({type:'manual-swap',order,token:replacement});setReplacement('');}}>Поменять жетон</button></div>}</>}
 <details><summary>Передать ход</summary>{g.seats.map(id=><button key={id} onClick={()=>send({type:'manual-turn',owner:id})}>{g.round.players[id].name}</button>)}</details>
 {viewer==='0'&&g.phase==='placement'&&<button onClick={()=>send({type:'manual-resolve'})}>Рассчитать бои и раскрыть поле</button>}</details>;
}
function RevealPanel({g,active,send}:{g:FullState;active:boolean;send:Send}){
 const [auto,setAuto]=useState(true),r=g.replay!,id=r.steps[r.cursor],p=g.round.provinces[id],battle=g.round.battles.find(b=>b.province===id);
 useEffect(()=>{if(!auto||!active||g.manual)return;const timer=setTimeout(()=>send({type:'reveal-next'}),2600);return ()=>clearTimeout(timer);},[auto,active,r.cursor,g.manual]);
 const removed=g.round.removed.filter(x=>g.round.orders.find(o=>o.id===x.order)?.target===id);
 return <section className="reveal-panel" aria-live="polite"><span className="eyebrow">{r.cursor<0?'Сначала особые приказы':`${r.cursor+1} / ${r.steps.length} этапов`}</span><h2>{r.current?.kind==='raid'?'Разгром':r.current?.kind==='diplomacy'?'Мир':r.current?.kind==='invalid'?'Блеф снят':p?.name??'Час сражений'}</h2>{r.current&&r.current.kind!=='battle'&&<p>{r.current.targets.map(id=>g.round.provinces[id].name).join(' · ')}. Все затронутые приказы сняты.</p>}{p?<div key={id} className="reveal-result">{battle?<><p>{Object.entries(battle.strengths).map(([who,n])=>`${g.round.players[who].name}: ${n}`).join(' · ')}</p><p>Защита: <b>{battle.defense}</b></p><strong>{battle.winner===null?'Провинция остаётся свободной':`${g.round.players[battle.winner].name} ${battle.winner===battle.previous?'удерживает':'захватывает'} провинцию`}</strong></>:<p>{removed.length?'Приказы сняты до боя.':'Без сражения — контроль сохранён.'}</p>}{removed.map(x=><small key={x.order}>{x.reason}</small>)}{p.special&&<p>Особое состояние: {specialLabels[p.special.kind]}</p>}</div>:<p>Сначала снимаем недопустимые приказы, затем разрешаем разгром и мир. После этого показываем бои по провинциям.</p>}
 {active?<div className="reveal-actions"><button onClick={()=>setAuto(!auto)}>{g.manual?'Автопоказ отключён в ручном режиме':auto?'Пауза':'Автоматически'}</button><button onClick={()=>{setAuto(false);send({type:'reveal-next'});}}>{r.cursor===r.steps.length-1?'Завершить раскрытие':'Следующий этап'}</button></div>:<p>Раскрытие ведёт первый игрок. Все участники видят один шаг.</p>}</section>;
}

function RulesDialog({onClose}:{onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="rules-dialog" aria-label="Правила игры" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><button className="dialog-close" autoFocus onClick={onClose} aria-label="Закрыть правила">✕</button>
  <h2>Пять раундов борьбы за честь</h2>
  <nav className="rules-nav"><a href="#rules-round">Раунд</a><a href="#rules-tokens">Жетоны</a><a href="#rules-specials">Особые жетоны</a><a href="#rules-clans">Кланы</a><a href="#rules-controls">Управление</a></nav>
  <section id="rules-round"><h3>Как идёт раунд</h3><ol><li><b>Карты территорий.</b> Со 2-го раунда по очереди разыгрывайте карты или пасуйте. Карту получает тот, кто контролирует всю территорию.</li><li><b>Расстановка.</b> За ширмой у вас 6 жетонов (у Дракона — 7, один возвращается). По очереди кладите по одному закрытому приказу, пока в руке не останется один.</li><li><b>Раскрытие.</b> Снимаются блеф и незаконные приказы, затем набеги, затем дипломатия, затем одновременно все бои.</li><li><b>Бой.</b> Сила атакующих против защиты: печатная защита, открытые жетоны контроля, бонусы и защитные приказы владельца. Успешная оборона добавляет открытый контроль.</li></ol><p>После пятого раунда считается честь провинций, бонус за целые территории и тайная цель.</p></section>
  <section id="rules-tokens"><h3>Боевые жетоны</h3><TokenGuide/></section>
  <section id="rules-specials"><h3>Особые жетоны на поле</h3><SpecialGuide/></section>
  <section id="rules-clans"><h3>Способности кланов</h3><ClanTable/></section>
  <section id="rules-controls"><h3>Управление</h3><ul><li>Колесо мыши — приблизить поле к курсору, перетаскивание — сдвинуть, двойной щелчок — всё поле.</li><li>Наведите на карту — она увеличится. Наведите на игрока справа — его способность, уникальный жетон и карты.</li><li>Цветное кольцо вокруг жетона на поле — цвет клана владельца. Заливка провинции — её владелец.</li></ul></section>
  <a href="https://images-cdn.fantasyflightgames.com/filer_public/95/ef/95ef7efa-c0e1-4ae9-bd33-5439d236cefb/l5b01_rulebook_webcompressed.pdf" target="_blank" rel="noreferrer">Полные правила издателя ↗</a>
 </dialog>;
}
