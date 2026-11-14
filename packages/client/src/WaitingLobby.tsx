import {useEffect,useRef,useState} from 'react';
import {CLANS,type Clan,type FullState,type Action} from '@rokugan/engine';
import type {RoomPlayer,Session} from './net';
import {Emblem,clanColors} from './Art';
import {ClanBrief,ClanTable,TokenGuide} from './Screen';

/** Совет кланов: места, выбор клана, случайная раздача и старт хозяином. */
export function WaitingLobby({g,session,members,onReady,onStart,onLeave,exit,onAction}:{g:FullState;session:Session;members?:RoomPlayer[];onReady:()=>void;onStart:()=>void;onLeave?:()=>void;exit:()=>void;onAction:(a:Action,id?:string)=>void}){
 const local=!session.matchID,me=session.playerID??'0',joined=local?g.seats.length:members?.filter(p=>p.name).length??0;
 const [localSeat,setLocalSeat]=useState('0'),[showClans,setShowClans]=useState(false);
 const seat=local?localSeat:me,chosen=g.lobby?.clans??{},random=g.lobby?.random??{},host=local||me==='0';
 const name=members?.find(p=>String(p.id)===me)?.name;
 // Занятое место — уже подтверждение; смена клана регистрируется автоматически.
 useEffect(()=>{if(!local&&!session.watch&&name&&(!g.lobby?.ready[me]||g.lobby?.names[me]!==name))onReady();},[local,session.watch,name,g.lobby?.ready[me],g.lobby?.names[me]]);
 const full=joined===g.seats.length,ready=g.seats.every(id=>g.lobby?.ready[id]);
 const selected=chosen[seat],anyRandom=g.seats.some(id=>random[id]);
 const seatName=(id:string)=>local?`Игрок ${+id+1}`:members?.find(p=>String(p.id)===id)?.name;
 const capital=(clan:Clan)=>g.round.provinces[CLANS[clan].capital]?.name;
 return <main className="council-page">
  <header className="council-heading"><span className="eyebrow">БИТВА ЗА РОКУГАН</span><h1>Совет кланов</h1><p>{session.watch?'Наблюдайте за сбором игроков.':local?'Выберите кланы участников и начните партию.':'Выберите свой клан. Когда все займут места, хозяин начнёт игру.'}</p></header>
  <section className="council-card">
   <header className="council-card-heading"><h2>За столом {joined} из {g.seats.length}</h2><span>{local?'За одним компьютером':'Сетевая партия'}</span></header>
   <div className="council-seats">{g.seats.map(id=>{const clan=chosen[id],playerName=seatName(id);return <div className={`council-seat ${id===seat&&!session.watch?'mine':''} ${clan?'has-clan':''}`} style={clan?{['--clan' as string]:clanColors[clan]}:undefined} key={id}>
    <span className="council-number">{+id+1}</span><Emblem clan={clan}/>
    <div className="council-seat-name"><b>{playerName??'Свободное место'}{!local&&!session.watch&&id===me?' · вы':''}</b><small>{clan?<><span className="clan-name">{CLANS[clan].name}</span>{random[id]?' · выпал случайно':''}</>:'Клан не выбран — раздастся случайно'}{id==='0'?' · хозяин':''}</small></div>
    {local?<button aria-pressed={seat===id} onClick={()=>setLocalSeat(id)}>{seat===id?'Выбираем клан':'Выбрать клан'}</button>:<span className="council-presence">{playerName?'За столом':'Ожидаем'}</span>}
   </div>;})}</div>
   {!session.watch&&<section className="council-clans">
    <div className="council-clans-head"><h3>{local?`Клан игрока ${+seat+1}`:'Ваш клан'}</h3><button className="link-button" onClick={()=>setShowClans(true)}>Все кланы и жетоны</button></div>
    <div className="council-clan-options" role="radiogroup" aria-label="Клан игрока">{(Object.keys(CLANS) as Clan[]).map(id=>{
     const holder=g.seats.find(p=>p!==seat&&chosen[p]===id),locked=!!holder&&!random[holder];
     const note=holder?(locked?`выбрал ${seatName(holder)??`игрок ${+holder+1}`}`:`выпал месту ${+holder+1}`):'';
     return <button role="radio" aria-checked={selected===id} aria-label={`${CLANS[id].name}${note?' — '+note:''}`} title={`${CLANS[id].ability}${holder&&!locked?' Можно забрать: тому месту достанется ваш клан.':''}`} key={id} disabled={locked} style={{['--clan' as string]:clanColors[id]}} onClick={()=>onAction({type:'lobby-clan',clan:id},seat)}>
      <Emblem clan={id}/><span className="clan-name">{CLANS[id].name}</span>{note&&<small>{note}</small>}
     </button>;})}</div>
    {selected?<div className="council-clan-preview"><ClanBrief clan={selected} owner={seat}><p className="clan-capital">Столица — <b>{capital(selected)}</b>. В наборе 27 жетонов: 26 общих и уникальный.</p></ClanBrief></div>
     :<p className="council-note">Выберите клан или оставьте случайный. Кланы, выбранные игроками, не повторяются.</p>}
   </section>}
   <p className="council-note">Базовая игра · 5 раундов · все семь кланов и Земли Тени</p>
   {g.errors[seat]&&<p className="error" role="alert">{g.errors[seat]}</p>}
   {!session.watch&&host?<div className="council-actions"><button onClick={()=>onAction({type:'random-clans'},'0')}>{anyRandom?'Перебросить случайно':'Случайно'}</button><button className="primary" disabled={!local&&(!full||!ready)} onClick={onStart}>{!full?'Ждём игроков…':!local&&!ready?'Подключаем игроков…':'Начать игру'}</button></div>:<p className="council-note" role="status">{full?'Все места заняты. Ждём, пока хозяин начнёт игру.':'Ждём остальных игроков.'}</p>}
   {!session.watch&&host&&<p className="council-note">«Случайно» раздаёт кланы всем, кто не выбрал свой сам; повторное нажатие раздаёт заново. Выпавший клан можно сменить или забрать себе.</p>}
  </section>
  <footer className="council-footer">{onLeave&&!session.watch&&<button onClick={onLeave}>Освободить моё место</button>}<button className="back" onClick={exit}>← На главную</button></footer>
  {showClans&&<ClansDialog onClose={()=>setShowClans(false)}/>}
 </main>;
}

/** Справка по кланам: способности, уникальные жетоны и общий набор жетонов. */
function ClansDialog({onClose}:{onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="rules-dialog clans-dialog" aria-label="Кланы Рокугана" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <button className="dialog-close" autoFocus onClick={onClose} aria-label="Закрыть справку">✕</button>
  <h2>Семь великих кланов</h2>
  <p>У каждого клана своя способность и один уникальный боевой жетон. Остальные 26 жетонов у всех одинаковые: армии (16: силой 1 ×6, 2 ×4, 3 ×3, 4 ×2, 5 ×1), флоты (3: силой 1 ×2, 2 ×1), синоби (2: силой 1 и 2), благословения (2), набег, дипломатия и блеф.</p>
  <section><h3>Кланы</h3><ClanTable/></section>
  <section><h3>Что делает каждый жетон</h3><TokenGuide/></section>
 </dialog>;
}
