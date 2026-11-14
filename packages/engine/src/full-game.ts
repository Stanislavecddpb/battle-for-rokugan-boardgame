import type {Game} from 'boardgame.io';
import {INVALID_MOVE} from 'boardgame.io/core';
import {CARDS,CLANS,OBJECTIVES,clanTokens,createMap,objectivePoints,type Clan} from './content';
import {type ResolutionFrame,place,placementError,playerView,resolve,scout,shugenja,score,territoryOwners,tokenLegal} from './rules';
import type {RoundState,Token,Placement,Province,Special,Order} from './types';

export type Phase='lobby'|'clan'|'objective'|'draft'|'dragon'|'upkeep'|'placement'|'unicorn'|'reveal'|'resolution'|'finished';
export interface Secrets {pool:Token[];objectives:string[];objective:string|null;aside:Token[];intel:Token[]}
export interface CardSlot {territory:string;id:string;owner:string|null;used:boolean;revealed:boolean}
export interface Result {player:string;flowers:number;defense:number;territories:number;objective:number;provinces:number;total:number}
export interface FullState {
 round:RoundState;phase:Phase;number:number;active:string;first:string;seats:string[];
 secrets:Record<string,Secrets>;initiative:string[];initiativeShown:string;cards:CardSlot[];
 draft:Record<string,number>;passes:number;stopped:string[];firstUsed:boolean;scorpionUsed:boolean;
 pending:null|{kind:'dark'|'exchange'|'intel';player:string;ids:string[];count:number};
 log:string[];results:Result[];
 /** Последний публично сброшенный картой/способностью жетон: клиент показывает его всем. */
 flash?:{id:number;text:string;tokens:{owner:string;token:Token}[]};
 /** Только в проекции игрока: сколько жетонов в резерве и в сбросе у каждого. */
 reserve?:Record<string,number>;winners:string[];revision:number;errors:Record<string,string>;
 lobby?:{ready:Record<string,boolean>;names:Record<string,string>;clans?:Record<string,Clan>};
 manual?:boolean; cinematic?:boolean; undoState?:FullState; canUndo?:boolean;
 replay?:{frames?:ResolutionFrame[];current?:{kind:ResolutionFrame['kind'];targets:string[]};before:Record<string,Province>;cards:CardSlot[];steps:string[];cursor:number;after:'resolution'|'finished';logFrom?:number};
}
export interface Action {
 type:string;clan?:string;objective?:string;province?:string;token?:string;order?:string;
 placement?:Placement;peek?:string;ids?:string[];card?:string;provinces?:string[];orders?:string[];
 hand?:string[];discard?:string[];opponent?:string;sacrifice?:string;returnTo?:'pool'|'discard';
 returns?:{token:string;to:'pool'|'discard'}[];
 name?:string;ready?:boolean;
 owner?:string|null;control?:number;enabled?:boolean;faceup?:boolean;
}
export type Shuffle=<T>(items:T[])=>T[];
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function insist(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message);}
function next(g:FullState,id=g.active){return g.seats[(g.seats.indexOf(id)+1)%g.seats.length];}
function note(g:FullState,message:string){g.log.push(message);if(g.log.length>1000)g.log.shift();}
const INITIATIVE:Record<string,string>={cards:'«Больше всех карт территорий»',provinces:'«Больше всех провинций»',controls:'«Больше всех жетонов контроля»'};
/** Публичное описание места приказа (сам жетон закрыт). */
function where(g:FullState,o:{target:string;from?:string}){const t=`«${g.round.provinces[o.target].name}»`;return o.from==='sea'?`с моря на ${t}`:o.from?`на границу «${g.round.provinces[o.from].name}» → ${t}`:`в центр ${t}`;}
const KIND:Record<string,string>={army:'армия',navy:'флот',shinobi:'синоби',blessing:'благословение',raid:'набег',diplomacy:'дипломатия',bluff:'блеф'};
export const tokenText=(t:Token)=>`${KIND[t.kind]??t.kind}${t.strength?' '+t.strength:''}`;
function flash(g:FullState,text:string,tokens:{owner:string;token:Token}[]){g.flash={id:(g.flash?.id??0)+1,text,tokens:copy(tokens)};note(g,text);}
function province(g:FullState,id?:string){insist(id && Object.hasOwn(g.round.provinces,id),'Выберите провинцию.');return g.round.provinces[id];}
function selectable(g:FullState,id:string):Order{
 const o=g.round.orders.find(o=>o.id===id);
 insist(o&&!o.parent&&!g.round.orders.some(x=>x.parent===id),'Благословлённые приказы защищены.');return o;
}
function discardOrder(g:FullState,id:string,by?:string){
 const o=selectable(g,id);g.round.orders=g.round.orders.filter(x=>x.id!==id);
 if(o.token.kind==='bluff')g.round.players[o.player].hand.push(o.token);else g.round.discarded.push(o.token);
 flash(g,`${by?by+': ':''}открыт и сброшен приказ ${g.round.players[o.player].name} в «${g.round.provinces[o.target].name}» — ${tokenText(o.token)}${o.token.kind==='bluff'?' (блеф вернулся за ширму)':''}.`,[{owner:o.player,token:o.token}]);
}
function sacrifice(g:FullState,id:string|undefined,player:string){
 const p=province(g,id);insist(p.owner===player&&!p.shadowlands,'Нужен свой контроль вне Земель Тени.');
 if(p.control>0)p.control--;else p.owner=null;
}
function setSpecial(p:Province,s:Special){
 insist(!['peace','scorched'].includes(p.special?.kind??''),'Мир и выжженную землю нельзя заменить.');p.special=s;
}
export function setupFull(n:number,shuffle:Shuffle,waiting=false):FullState{
 insist(Number.isInteger(n)&&n>=2&&n<=5,'Нужно 2–5 игроков.');
 const seats=Array.from({length:n},(_,i)=>String(i)),objectives=shuffle(Object.keys(OBJECTIVES));
 const round:RoundState={provinces:createMap(),players:{},orders:[],discarded:[],nextOrder:0,revealed:false,battles:[],removed:[]};
 const secrets:Record<string,Secrets>={};
 for(const id of seats){round.players[id]={name:`Игрок ${+id+1}`,hand:[],scouts:2,shugenja:1,ronin:false,knowledge:{}};secrets[id]={pool:[],objectives:objectives.splice(0,2),objective:null,aside:[],intel:[]};}
 return {round,secrets,seats,phase:waiting?'lobby':'clan',lobby:{ready:Object.fromEntries(seats.map(id=>[id,false])),names:{}},number:1,active:'0',first:'0',initiative:[],initiativeShown:'',
  cards:[...new Set(CARDS.map(c=>c.territory))].map(territory=>({territory,id:shuffle(CARDS.filter(c=>c.territory===territory))[0].id,owner:null,used:false,revealed:false})),
  draft:{},passes:0,stopped:[],firstUsed:false,scorpionUsed:false,pending:null,log:['Выберите кланы.'],results:[],winners:[],revision:0,errors:{}};
}
function beginPlacement(g:FullState){g.phase='placement';g.active=g.first;g.stopped=[];advancePlacement(g,false);}
function afterDraw(g:FullState){g.active=g.first;if(g.number===1)beginPlacement(g);else {g.phase='upkeep';g.passes=0;}}
function upkeep(g:FullState,shuffle:Shuffle){
 g.round.orders=[];g.round.revealed=false;g.firstUsed=false;g.scorpionUsed=false;
 const before=g.first;
 if(g.number>1){
  const card=g.initiative.shift()!;g.initiativeShown=card;
  if(g.seats.includes(card))g.first=card;
  else {
   const values=g.seats.map(id=>card==='cards'?g.cards.filter(c=>c.owner===id&&!c.used).length:
    Object.values(g.round.provinces).filter(p=>p.owner===id).reduce((sum,p)=>sum+(card==='controls'?p.control+1:1),0));
   const max=Math.max(...values);
   // From immediately right of the old first, with the old first considered last.
   for(let i=1;i<=g.seats.length;i++){const id=g.seats[(g.seats.indexOf(g.first)-i+g.seats.length)%g.seats.length];if(values[+id]===max){g.first=id;break;}}
  }
 }
 for(const id of g.seats){
  const p=g.round.players[id],sec=g.secrets[id];p.ronin=!Object.values(g.round.provinces).some(x=>x.owner===id);p.knowledge={};sec.intel=[];
  p.hand.push(...sec.aside);sec.aside=[];
  const bluff=sec.pool.find(t=>t.kind==='bluff');if(bluff){sec.pool=sec.pool.filter(t=>t!==bluff);p.hand.push(bluff);}
  sec.pool=shuffle(sec.pool);
  const limit=p.clan==='dragon'?7:6;
  while(p.hand.length<limit&&sec.pool.length)p.hand.push(sec.pool.pop()!);
 }
 const dragon=g.seats.find(id=>g.round.players[id].clan==='dragon'&&g.round.players[id].hand.length>6);
 if(dragon){g.phase='dragon';g.active=dragon;}else afterDraw(g);
 if(g.number>1){
  const card=g.initiativeShown,how=g.seats.includes(card)?`карта клана ${g.round.players[card].name}`:INITIATIVE[card]??card;
  note(g,`Раунд ${g.number}. Карта инициативы: ${how} → первый игрок: ${g.round.players[g.first].name}${g.first===before?' (остаётся)':''}.`);
 }else note(g,`Раунд ${g.number}. Первый игрок: ${g.round.players[g.first].name}.`);
}
export function availablePlacements(g:FullState,player:string):Placement[]{
 const out:Placement[]=[];
 for(const t of g.round.players[player].hand)for(const p of Object.values(g.round.provinces)){
  const candidates:Placement[]=t.kind==='blessing'?g.round.orders.filter(o=>o.player===player&&!o.parent&&!o.faceup).map(o=>({token:t.id,target:o.target,from:o.from,parent:o.id})):
   [{token:t.id,target:p.id},...['sea',...p.neighbors].map(from=>({token:t.id,target:p.id,from}))];
  for(const input of candidates)if(!placementError(g.round,player,input))out.push(input);
 }return [...new Map(out.map(p=>[`${p.token}:${p.target}:${p.from??''}:${p.parent??''}`,p])).values()];
}
function finishRound(g:FullState){
 const before=copy(g.round.provinces),cards=copy(g.cards),logBefore=g.log.length;
 const frames:ResolutionFrame[]=[];g.round=resolve(g.round,frames);
 const owners=territoryOwners(g.round.provinces);
 for(const c of g.cards)if(!c.used){c.owner=owners[c.territory]??null;if(c.owner)c.revealed=true;}
 // Один общий журнал: снятые приказы и итог каждого боя пишутся сюда же.
 const name=(id:string|null)=>id===null?'никто':g.round.players[id].name;
 for(const r of g.round.removed){const o=g.round.orders.find(o=>o.id===r.order);if(o)note(g,`Снят: ${name(o.player)}, ${tokenText(o.token)} в «${g.round.provinces[o.target].name}» — ${r.reason}`);}
 for(const b of g.round.battles)note(g,`Бой за «${g.round.provinces[b.province].name}»: ${Object.entries(b.strengths).map(([id,v])=>`${name(id)} ${v}`).join(' / ')}, защита ${b.defense} → ${b.winner===null?'свободна':b.winner===b.previous?`${name(b.winner)} удерживает`:`${name(b.winner)} захватывает`}.`);
 note(g,`Раунд ${g.number}: разрешено боёв — ${g.round.battles.length}.`);
 g.active=g.first;
 if(g.number===5){
  g.phase='finished';g.results=g.seats.map(player=>{const base=score(g.round.provinces,player),objective=objectivePoints(g.round,g.secrets[player].objective!,player);
   return {...base,player,objective,provinces:Object.values(g.round.provinces).filter(p=>p.owner===player).length,total:base.total+objective};});
  // Tie-break territory count includes Shadowlands, unlike the five-honor territory bonus.
  const territoryCount=(id:string)=>Object.values(owners).filter(x=>x===id).length;
  const highest=Math.max(...g.results.map(r=>r.total));
  const tied=g.results.filter(r=>r.total===highest),territories=Math.max(...tied.map(r=>territoryCount(r.player)));
  const finalists=tied.filter(r=>territoryCount(r.player)===territories),provinces=Math.max(...finalists.map(r=>r.provinces));
  g.winners=finalists.filter(r=>r.provinces===provinces).map(r=>r.player);
 }else g.phase='resolution';
 if(g.cinematic){
  const steps=frames.map(f=>f.targets[0]);
  g.replay={before,cards,frames,steps,cursor:-1,after:g.phase as 'resolution'|'finished',logFrom:Math.min(logBefore,g.log.length)};g.phase='reveal';
 }
}
function advancePlacement(g:FullState,advance=true){
 if(advance)g.active=next(g);
 for(let i=0;i<g.seats.length;i++){
  const id=g.active,p=g.round.players[id];
  if(p.hand.length>1&&!g.stopped.includes(id)){
   if(availablePlacements(g,id).length)return;
   g.stopped.push(id);note(g,`${p.name}: нет доступных мест для приказов.`);
  }g.active=next(g);
 }
 const unicorn=g.seats.find(id=>g.round.players[id].clan==='unicorn');
 if(unicorn){g.phase='unicorn';g.active=unicorn;}else finishRound(g);
}
function exchangeHand(g:FullState,player:string,returns:Action['returns'],count:number,shuffle:Shuffle){
 insist(Array.isArray(returns)&&returns.length===count&&new Set(returns.map(r=>r.token)).size===count,'Выберите жетоны для возврата.');
 const p=g.round.players[player];
 for(const r of returns){const index=p.hand.findIndex(t=>t.id===r.token);insist(index>=0&&['pool','discard'].includes(r.to),'Неверный жетон возврата.');
  const [t]=p.hand.splice(index,1);
  if(t.kind==='bluff'&&r.to==='discard')p.hand.push(t);else if(r.to==='pool')g.secrets[player].pool.push(t);else g.round.discarded.push(t);
 }g.secrets[player].pool=shuffle(g.secrets[player].pool);
}
function playCard(g:FullState,player:string,a:Action,shuffle:Shuffle){
 const slot=g.cards.find(c=>c.id===a.card&&c.owner===player&&!c.used),card=CARDS.find(c=>c.id===a.card);
 insist(slot&&card,'Эта карта вам не принадлежит.');
 const shadow=['north','south'].includes(card.territory);
 insist(g.phase===(shadow?'placement':'upkeep'),'Карта недоступна в этой фазе.');
 const ids=a.provinces??[],ps=ids.map(id=>province(g,id)),orders=a.orders??[],p=ps[0],q=ps[1];
 const own=(v:Province|undefined)=>insist(v?.owner===player,'Выберите свою провинцию.');
 const nonshadow=()=>insist(ps.every(p=>!p.shadowlands),'Земли Тени не подходят.');
 if(card.provinces){
  const optional=['peace','pirates','fear'].includes(card.id);
  insist(ps.length<=(card.provinces)&&ps.length>=(card.id==='fear'?0:optional?1:card.provinces),'Неверное число провинций.');
  insist(new Set(ids).size===ids.length,'Провинции должны различаться.');
 }
 if(card.sacrifice)sacrifice(g,a.sacrifice,player);
 switch(card.id){
  case 'harbor':insist(!p.coastal,'Нужна внутренняя провинция.');setSpecial(p,{kind:'harbor'});break;
  case 'honor':nonshadow();ps.forEach(p=>setSpecial(p,{kind:'honor',value:1}));break;
  case 'peace':if(p.owner!==null&&p.owner!==player){own(q);q.control+=2;}setSpecial(p,{kind:'peace'});break;
  case 'shrine':setSpecial(p,{kind:'shrine'});break;
  case 'purpose':ps.forEach(p=>{own(p);p.control++;});break;
  case 'pirates':if(p.owner===player){own(q);q.control+=3;}setSpecial(p,{kind:'scorched'});p.owner=null;p.control=0;break;
  case 'port':nonshadow();setSpecial(p,{kind:'honor',value:2});break;
  case 'bushido':nonshadow();setSpecial(p,{kind:'honor',value:4});break;
  case 'battlefield':setSpecial(p,{kind:'battlefield'});break;
  case 'levies':nonshadow();ps.forEach(p=>setSpecial(p,{kind:'defense',value:1}));break;
  case 'harvest':own(p);p.control+=2;break;
  case 'kami':nonshadow();setSpecial(p,{kind:'defense',value:2});break;
  case 'bless':insist(p.special?.kind==='scorched','Нужна выжженная земля.');delete p.special;p.owner=player;p.control=1;break;
  case 'rebellion':insist(p.special?.kind==='peace','Нужен жетон мира.');delete p.special;if(p.owner===player)p.control+=2;break;
  case 'spy':{
   insist(a.opponent&&g.seats.includes(a.opponent)&&a.opponent!==player,'Выберите соперника.');
   const hand=g.round.players[a.opponent].hand;g.secrets[player].intel=copy(hand);
   const at=hand.findIndex(t=>t.kind==='bluff');if(at>=0)g.secrets[a.opponent].aside.push(...hand.splice(at,1));break;
  }
  case 'exchange':{
   own(p);insist(q.owner!==null&&q.owner!==player,'Вторая провинция должна принадлежать сопернику.');
   [p.owner,q.owner]=[q.owner,p.owner];[p.control,q.control]=[q.control,p.control];break;
  }
  case 'fear':ps.forEach(p=>{insist(p.special,'Нет особого жетона.');delete p.special;});break;
  case 'dark':{
   insist(orders.length>=1&&orders.length<=4&&new Set(orders).size===orders.length,'Выберите 1–4 приказа.');
   for(const id of orders)g.round.players[player].knowledge[id]=copy(selectable(g,id).token);
   g.pending={kind:'dark',player,ids:orders,count:1};break;
  }
  case 'purge':{
   insist(orders.length===2&&new Set(orders).size===2,'Нужны два разных приказа.');
   orders.forEach(id=>selectable(g,id));
   const hand=g.round.players[player].hand,at=hand.findIndex(t=>t.id===a.hand?.[0]);insist(at>=0,'Выберите жетон руки.');
   const [token]=hand.splice(at,1);if(token.kind==='bluff')hand.push(token);else g.round.discarded.push(token);
   flash(g,`Изгнание слабых: ${g.round.players[player].name} сбрасывает из руки ${tokenText(token)}.`,[{owner:player,token}]);
   orders.forEach(id=>discardOrder(g,id,'Изгнание слабых'));break;
  }
  case 'animate':{
   const at=g.round.discarded.findIndex(t=>t.id===a.discard?.[0]&&t.owner===player);insist(at>=0,'Выберите жетон из своего сброса.');
   const [token]=g.round.discarded.splice(at,1);g.round.players[player].hand.push(token);
   insist(a.placement&&a.placement.token===token.id,'Укажите размещение возвращённого жетона.');
   const err=place(g.round,player,a.placement);insist(!err,err??'');
   const o=g.round.orders.at(-1)!;insist(token.kind==='blessing'?!!o.parent:tokenLegal(g.round,o),'Открытый жетон должен размещаться по правилам.');o.faceup=true;break;
  }
  case 'promotion':case 'reinforce':{
   const count=card.id==='promotion'?1:2,ids=a.discard??[];
   insist(ids.length===count&&new Set(ids).size===count,'Выберите жетоны из своего сброса.');
   for(const id of ids){const at=g.round.discarded.findIndex(t=>t.id===id&&t.owner===player&&(card.id==='reinforce'?t.kind==='army':['army','navy','shinobi'].includes(t.kind)));
    insist(at>=0,'Неподходящий жетон сброса.');g.round.players[player].hand.push(...g.round.discarded.splice(at,1));}
   g.pending={kind:'exchange',player,ids:[],count};break;
  }
 }
 slot.used=true;slot.revealed=true;slot.owner=null;
 const targets=[...(a.sacrifice?[`жертвует контролем в «${g.round.provinces[a.sacrifice].name}»`]:[]),...ids.map(id=>`«${g.round.provinces[id].name}»`),...(card.id==='spy'&&a.opponent?[`смотрит руку: ${g.round.players[a.opponent].name}`]:[]),...(card.id==='animate'&&a.placement?[`открытый жетон ${where(g,a.placement)}`]:[])];
 note(g,`${g.round.players[player].name} играет карту «${card.name}»${targets.length?': '+targets.join(', '):''}.`);
 if(card.id==='purge')advancePlacement(g);
 else if(!shadow&&!g.pending){g.passes=0;g.active=next(g);}
}

/** Transactional reducer: invalid commands never leave half-applied costs or effects. */
export function act(input:FullState,player:string,a:Action,shuffle:Shuffle):{state:FullState;error?:string}{
 const g=copy(input);
 try{
  insist(a&&typeof a==='object'&&typeof a.type==='string','Неверная команда.');
  insist(g.seats.includes(player)&&(g.active===player||g.phase==='lobby'||a.type==='mode'||(g.manual&&a.type.startsWith('manual-')))&&g.phase!=='finished','Сейчас ход другого игрока.');
  if(a.type==='mode'){
   insist(g.phase!=='lobby'||player==='0','В лобби режим меняет хозяин.');
   insist(typeof a.enabled==='boolean','Выберите режим.');g.manual=a.enabled;note(g,a.enabled?'Включён свободный режим: участники могут редактировать поле.':'Включена проверка правил.');
  }else if(g.manual&&a.type==='manual-undo'){
   insist(g.undoState,'Нет действия для отмены.');const restored=copy(g.undoState);delete restored.undoState;restored.canUndo=false;restored.manual=true;restored.revision=g.revision+1;restored.errors={};note(restored,`${g.round.players[player].name}: последнее действие отменено вручную.`);return {state:restored};
  }else if(g.manual&&a.type.startsWith('manual-')){
   insist(['placement','upkeep','resolution','draft','dragon','unicorn'].includes(g.phase)&&!g.pending,'Завершите текущее действие перед редактированием.');
   if(a.type==='manual-control'){
    const p=province(g,a.province);insist(a.owner===null||g.seats.includes(a.owner??''),'Неизвестный владелец.');
    insist(Number.isInteger(a.control)&&a.control!>=0&&a.control!<=30,'Укрепления: от 0 до 30.');
    p.owner=a.owner!;p.control=a.owner===null?0:a.control!;note(g,`Ручной контроль: ${p.name} → ${p.owner===null?'свободна':g.round.players[p.owner].name}, укрепления ${p.control}.`);
   }else if(a.type==='manual-place'||a.type==='manual-move'){
    insist(!g.round.revealed&&a.placement,'Приказы можно перемещать до раскрытия.');const p=province(g,a.placement.target),from=a.placement.from;
    insist(!from||from==='sea'||!!g.round.provinces[from],'Неизвестный источник.');
    if(a.type==='manual-place'){
     const hand=g.round.players[player].hand,at=hand.findIndex(t=>t.id===a.placement!.token);insist(at>=0,'Жетон должен быть в вашей руке.');
     g.round.orders.push({id:`order-${g.round.nextOrder++}`,player,token:hand.splice(at,1)[0],target:p.id,...(from?{from}:{})});
    }else{
     const o=g.round.orders.find(o=>o.id===a.order);insist(o,'Выберите приказ.');
     
     const stack=[o,...g.round.orders.filter(x=>x.parent===o.id)];for(const item of stack){item.target=p.id;item.from=from;}
     for(const pl of Object.values(g.round.players))for(const item of stack)delete pl.knowledge[item.id];
    }note(g,`Ручное размещение: ${g.round.players[player].name} → ${p.name}.`);
   }else if(a.type==='manual-return'){
    insist(!g.round.revealed,'Приказы уже в сбросе.');const o=g.round.orders.find(o=>o.id===a.order);insist(o,'Выберите приказ.');
    const stack=g.round.orders.filter(x=>x.id===o.id||x.parent===o.id);g.round.orders=g.round.orders.filter(x=>!stack.includes(x));
    for(const item of stack)g.round.players[item.player].hand.push(item.token);note(g,'Ручной возврат приказа в руку.');
   }else if(a.type==='manual-swap'){
    insist(!g.round.revealed,'Приказы уже раскрыты.');const o=g.round.orders.find(o=>o.id===a.order);insist(o,'Выберите приказ.');const hand=g.round.players[o.player].hand,at=hand.findIndex(t=>t.id===a.token);insist(at>=0,'Выберите жетон из руки владельца приказа.');insist(o.player===player,'Заменять жетон можно только из своей руки.');[o.token,hand[at]]=[hand[at],o.token];for(const pl of Object.values(g.round.players))delete pl.knowledge[o.id];note(g,'Ручная замена жетона в приказе.');
   }else if(a.type==='manual-turn'){
    insist(g.seats.includes(a.owner??''),'Выберите игрока.');g.active=a.owner!;note(g,`Ручная передача хода: ${g.round.players[g.active].name}.`);
   }else if(a.type==='manual-resolve'){
    insist(player==='0'&&g.phase==='placement','Раскрытие запускает хозяин во время размещения.');finishRound(g);
   }else throw Error('Неизвестное ручное действие.');
  }else if(g.phase==='lobby'){
   insist(g.lobby,'Лобби недоступно.');
   if(a.type==='lobby-clan'){
    insist(a.clan&&Object.hasOwn(CLANS,a.clan),'Выберите клан.');g.lobby.clans??={};
    insist(!Object.entries(g.lobby.clans).some(([id,clan])=>id!==player&&clan===a.clan),'Клан уже занят.');
    g.lobby.clans[player]=a.clan as Clan;g.lobby.ready[player]=false;
   }else if(a.type==='random-clans'){
    insist(player==='0','Случайную раздачу запускает первый игрок.');g.lobby.clans??={};
    const available=shuffle((Object.keys(CLANS) as Clan[]).filter(c=>!Object.values(g.lobby!.clans!).includes(c)));
    for(const id of g.seats)if(!g.lobby.clans[id]){g.lobby.clans[id]=available.pop()!;g.lobby.ready[id]=false;}
   }else if(a.type==='ready'){
    insist(typeof a.ready==='boolean','Укажите готовность.');
    if(a.name!==undefined){insist(typeof a.name==='string'&&a.name.trim().length>0&&a.name.trim().length<=20,'Введите имя до 20 символов.');g.lobby.names[player]=a.name.trim();}
    g.lobby.ready[player]=a.ready;
   }else if(a.type==='start'){
    insist(player==='0','Начать игру может только хозяин комнаты.');
    insist(g.seats.every(id=>g.lobby!.ready[id]),'Дождитесь готовности всех игроков.');
    const clans=shuffle((Object.keys(CLANS) as Clan[]).filter(c=>!Object.values(g.lobby!.clans??{}).includes(c)));
    for(const id of g.seats){const clan=g.lobby.clans?.[id]??clans.pop()!,p=g.round.players[id];p.clan=clan;p.name=CLANS[clan].name;
     const tokens=shuffle(clanTokens(clan,id)).map((t,i)=>({...t,id:`p${id}-t${i}`}));p.hand=tokens.filter(t=>t.kind==='bluff');g.secrets[id].pool=tokens.filter(t=>t.kind!=='bluff');g.round.provinces[CLANS[clan].capital].owner=id;
     note(g,`${g.lobby.names[id]??`Игрок ${+id+1}`} получает клан ${p.name}.`);
    }g.phase='objective';g.active='0';
   }else throw Error('Сначала соберите игроков и начните партию.');
  }else if(g.pending){
   insist(a.type==='pending','Сначала завершите действие карты.');
   if(g.pending.kind==='dark'){insist(a.order&&g.pending.ids.includes(a.order),'Выберите один из просмотренных приказов.');discardOrder(g,a.order,'Тёмные любимцы');g.pending=null;}
   else if(g.pending.kind==='intel'){g.pending=null;advancePlacement(g);}
   else {exchangeHand(g,player,a.returns,g.pending.count,shuffle);{const r=a.returns??[],pool=r.filter(x=>x.to==='pool').length;note(g,`${g.round.players[player].name} убирает из руки жетонов: в резерв — ${pool}, в сброс — ${r.length-pool}.`);}g.pending=null;g.passes=0;g.active=next(g);}
  }else if(a.type==='clan'){
   insist(g.phase==='clan'&&a.clan&&Object.hasOwn(CLANS,a.clan),'Выберите клан.');
   insist(!Object.values(g.round.players).some(p=>p.clan===a.clan),'Клан уже занят.');
   const p=g.round.players[player];p.clan=a.clan;p.name=CLANS[a.clan as Clan].name;
   const tokens=shuffle(clanTokens(a.clan as Clan,player)).map((t,i)=>({...t,id:`p${player}-t${i}`}));
   p.hand=tokens.filter(t=>t.kind==='bluff');g.secrets[player].pool=tokens.filter(t=>t.kind!=='bluff');
   g.round.provinces[CLANS[a.clan as Clan].capital].owner=player;
   g.active=next(g);if(g.active==='0')g.phase='objective';
  }else if(a.type==='objective'){
   insist(g.phase==='objective'&&a.objective&&g.secrets[player].objectives.includes(a.objective),'Выберите предложенную цель.');
   g.secrets[player].objective=a.objective;g.secrets[player].objectives=[];note(g,`${g.round.players[player].name} выбирает тайную цель.`);g.active=next(g);
   if(g.active==='0'){
    const deck=shuffle([...g.seats]);g.first=deck.shift()!;g.initiativeShown=g.first;
    g.initiative=shuffle([...deck,...shuffle(['cards','provinces','controls']).slice(0,4-deck.length)]);
    g.draft=Object.fromEntries(g.seats.map(id=>[id,({2:11,3:7,4:5,5:4} as Record<number,number>)[g.seats.length]]));g.phase='draft';g.active=g.first;
   }
  }else if(a.type==='draft'){
   insist(g.phase==='draft','Сейчас не подготовка.');const p=province(g,a.province);insist(p.owner===null,'Провинция уже занята.');
   p.owner=player;g.draft[player]--;note(g,`${g.round.players[player].name} занимает «${p.name}».`);g.active=next(g);if(Object.values(g.draft).every(n=>n===0))upkeep(g,shuffle);
  }else if(a.type==='dragon'){
   insist(g.phase==='dragon','Способность недоступна.');const p=g.round.players[player],index=p.hand.findIndex(t=>t.id===a.token);insist(index>=0,'Выберите жетон.');
   g.secrets[player].pool.push(...p.hand.splice(index,1));g.secrets[player].pool=shuffle(g.secrets[player].pool);note(g,`${p.name}: лишний жетон возвращён в резерв (способность Дракона).`);afterDraw(g);
  }else if(a.type==='pass'){
   insist(g.phase==='upkeep','Можно пасовать только при розыгрыше карт.');note(g,`${g.round.players[player].name}: пас.`);g.passes++;g.active=next(g);if(g.passes===g.seats.length)beginPlacement(g);
  }else if(a.type==='card')playCard(g,player,a,shuffle);
  else if(a.type==='place'){
   insist(g.phase==='placement'&&a.placement,'Сейчас нельзя размещать приказ.');const error=place(g.round,player,a.placement);insist(!error,error??'');
   {const o=g.round.orders.at(-1)!,parent=o.parent?g.round.orders.find(x=>x.id===o.parent):undefined;
    note(g,parent?`${g.round.players[player].name} благословляет свой приказ ${where(g,parent)}.`:`${g.round.players[player].name} кладёт приказ ${where(g,o)}.`);}
   if(a.peek){insist(g.round.players[player].clan==='scorpion'&&!g.scorpionUsed,'Способность Скорпиона недоступна.');const token=copy(selectable(g,a.peek).token);g.round.players[player].knowledge[a.peek]=token;g.secrets[player].intel=[token];g.scorpionUsed=true;{const o=g.round.orders.find(o=>o.id===a.peek)!;note(g,`${g.round.players[player].name} тайно смотрит приказ ${g.round.players[o.player].name} ${where(g,o)} (способность Скорпиона).`);}g.pending={kind:'intel',player,ids:[],count:0};}
   else advancePlacement(g);
  }else if(['scout','shugenja','first'].includes(a.type)){
   insist(g.phase==='placement'&&a.order,'Карта доступна перед размещением.');
   if(a.type==='scout'){const o=selectable(g,a.order);const err=scout(g.round,player,a.order);insist(!err,err??'');note(g,`${g.round.players[player].name}: разведчик смотрит приказ ${g.round.players[o.player].name} в «${g.round.provinces[o.target].name}».`);}
   else if(a.type==='shugenja'){const o=selectable(g,a.order),token=copy(o.token);const err=shugenja(g.round,player,a.order);insist(!err,err??'');flash(g,`Сюгэндзя (${g.round.players[player].name}): открыт и сброшен приказ ${g.round.players[o.player].name} в «${g.round.provinces[o.target].name}» — ${tokenText(token)}${token.kind==='bluff'?' (блеф вернулся за ширму)':''}.`,[{owner:o.player,token}]);}
   else {
    insist(player===g.first&&!g.firstUsed&&g.seats.length>2,'Карта первого игрока недоступна.');const o=selectable(g,a.order);
    g.round.players[player].knowledge[o.id]=copy(o.token);g.secrets[player].intel=[copy(o.token)];g.round.orders=g.round.orders.filter(x=>x.id!==o.id);note(g,`${g.round.players[player].name}: карта первого игрока возвращает приказ ${g.round.players[o.player].name} из «${g.round.provinces[o.target].name}» в резерв.`);
    if(o.token.kind==='bluff')g.secrets[o.player].aside.push(o.token);else {g.secrets[o.player].pool.push(o.token);g.secrets[o.player].pool=shuffle(g.secrets[o.player].pool);}g.firstUsed=true;
   }
  }else if(a.type==='unicorn'){
   insist(g.phase==='unicorn','Сейчас не обмен Единорога.');const ids=a.ids??[];
   insist(ids.length===0||(ids.length===2&&ids[0]!==ids[1]),'Выберите два приказа или откажитесь.');
   if(ids.length){const [x,y]=ids.map(id=>selectable(g,id));insist(x.player===player&&y.player===player,'Можно менять только свои приказы.');[x.token,y.token]=[y.token,x.token];[x.faceup,y.faceup]=[y.faceup,x.faceup];
    for(const p of Object.values(g.round.players)){delete p.knowledge[x.id];delete p.knowledge[y.id];}}
   note(g,ids.length?`${g.round.players[player].name} меняет местами жетоны двух своих приказов (способность Единорога).`:`${g.round.players[player].name} не использует способность Единорога.`);
   finishRound(g);
  }else if(a.type==='reveal-next'){
   insist(g.phase==='reveal'&&g.replay,'Сейчас нет раскрытия.');g.replay.cursor++;
   if(g.replay.cursor>=g.replay.steps.length){g.phase=g.replay.after;delete g.replay;}
  }else if(a.type==='continue'){
   insist(g.phase==='resolution','Раунд ещё не завершён.');g.number++;upkeep(g,shuffle);
  }else throw Error('Неизвестная команда.');
  if(!['mode','reveal-next','ready','lobby-clan','random-clans'].includes(a.type)){const previous=copy(input);delete previous.undoState;g.undoState=previous;g.canUndo=true;}
  g.errors[player]='';g.revision++;return {state:g};
 }catch(e){return {state:input,error:e instanceof Error?e.message:'Некорректная команда.'};}
}

export function fullPlayerView(g:FullState,viewer?:string|null):FullState{
 const view=copy(g);delete view.undoState;view.canUndo=!!g.undoState;view.round=playerView(g.round,viewer) as unknown as RoundState;view.initiative=[];
 view.errors=viewer?{[viewer]:g.errors[viewer]??''}:{};
 view.reserve=Object.fromEntries(g.seats.map(id=>[id,g.secrets[id].pool.length+g.secrets[id].aside.length]));
 view.secrets=Object.fromEntries(g.seats.map(id=>[id,{pool:id===viewer?copy(g.secrets[id].pool):[],objectives:id===viewer?copy(g.secrets[id].objectives):[],
  objective:id===viewer||g.phase==='finished'?g.secrets[id].objective:null,
  aside:id===viewer?copy(g.secrets[id].aside):[],intel:id===viewer?copy(g.secrets[id].intel):[]}]));
 // Карты территорий лежат рубашкой вверх только под полем; взятая игроком карта видна всем.
 view.cards=view.cards.map(c=>({...c,id:c.used||c.revealed||(c.owner!==null&&c.owner===viewer)?c.id:''}));
 if(g.phase==='reveal'&&g.replay){
  const done=new Set(g.replay.steps.slice(0,g.replay.cursor+1));
  for(const id of g.replay.steps)if(!done.has(id))view.round.provinces[id]=copy(g.replay.before[id]);
  view.round.battles=view.round.battles.filter(b=>done.has(b.province));
  view.cards=copy(g.replay.cards).map(c=>({...c,id:c.used||c.revealed||(c.owner!==null&&c.owner===viewer)?c.id:''}));
  if(g.replay.frames){const frame=g.replay.frames[g.replay.cursor];view.round.provinces=copy(frame?.provinces??g.replay.before);view.round.battles=copy(frame?.battles??[]);view.round.orders=view.round.orders.filter(o=>!frame?.removed.includes(o.id)||(frame.kind==='battle'&&frame.targets.includes(o.target)&&!g.round.removed.some(r=>r.order===o.id)));for(const o of view.round.orders){if(!['raid','diplomacy'].includes(o.token.kind)&&!(frame?.kind==='battle'&&frame.targets.includes(o.target)))(o as unknown as {token:Token|null}).token=null;}view.round.removed=view.round.removed.filter(r=>frame?.removed.includes(r.order));view.replay!.current=frame?{kind:frame.kind,targets:frame.targets}:undefined;delete view.replay!.frames;}
  view.replay!.cards=[];view.results=[];view.winners=[];
  // Итоги боёв в журнале появляются, когда раскрытие закончено: не раскрываем их раньше анимации.
  if(g.replay.logFrom!==undefined)view.log=view.log.slice(0,g.replay.logFrom);
 }
 if(view.pending&&view.pending.player!==viewer)view.pending={...view.pending,ids:[]};return view;
}
export const BattleForRokugan:Game<FullState>={
 name:'battle-for-rokugan',minPlayers:2,maxPlayers:5,disableUndo:true,
 setup:({ctx,random})=>({...setupFull(ctx.numPlayers,items=>random.Shuffle(items),true),cinematic:true}),
 validateSetupData:(data,n)=>n<2||n>5?'Нужно 2–5 игроков.':data?.expansions?.length?'Дополнения к Рокугану не поддерживаются.':undefined,
 turn:{activePlayers:{all:'play'}},
 moves:{act:{client:false,redact:true,move:({G,playerID,random},action:Action)=>{
  if(!playerID||!G.seats.includes(playerID))return INVALID_MOVE;const result=act(G,playerID,action,items=>random.Shuffle(items));
  if(result.error){G.errors[playerID]=result.error;return;}return result.state;
 }}},
 playerView:({G,playerID})=>fullPlayerView(G,playerID),
 // scores — итоговые очки игроков: платформа Zarya строит по ним места для рейтинга.
 endIf:({G})=>G.phase==='finished'?{winners:G.winners,scores:Object.fromEntries(G.results.map(r=>[r.player,r.total]))}:undefined,
};
