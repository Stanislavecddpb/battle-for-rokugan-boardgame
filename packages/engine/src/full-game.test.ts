import {describe,it,expect} from 'vitest';
import {Client} from 'boardgame.io/client';
import {Local} from 'boardgame.io/multiplayer';
import {act,setupFull,availablePlacements,fullPlayerView,BattleForRokugan,type FullState,type Action,type Shuffle} from './full-game';
import {CLANS,CARDS,OBJECTIVES,createMap,clanTokens,objectivePoints} from './content';
import {resolve,place,score,placementError} from './rules';
import type {TokenKind} from './types';
const unchanged:Shuffle=x=>[...x];
function rng(seed:number):Shuffle{return xs=>{const out=[...xs];for(let i=out.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;};}
function move(g:FullState,a:Action){const r=act(g,g.active,a,unchanged);expect(r.error).toBeUndefined();return r.state;}
function prepared(n=2,clans=Object.keys(CLANS)):FullState{
 let g=setupFull(n,unchanged);
 for(let i=0;i<n;i++)g=move(g,{type:'clan',clan:clans[i]});
 for(let i=0;i<n;i++)g=move(g,{type:'objective',objective:g.secrets[g.active].objectives[0]});
 while(g.phase==='draft')g=move(g,{type:'draft',province:Object.values(g.round.provinces).find(p=>p.owner===null)!.id});
 if(g.phase==='dragon')g=move(g,{type:'dragon',token:g.round.players[g.active].hand[0].id});
 return g;
}
function cardState(id:string):FullState{
 const g=prepared(),c=CARDS.find(c=>c.id===id)!;g.active='0';g.phase=['north','south'].includes(c.territory)?'placement':'upkeep';
 g.cards=g.cards.filter(c=>c.territory!==CARDS.find(c=>c.id===id)?.territory);g.cards.push({territory:c.territory,id,owner:'0',used:false,revealed:true});
 Object.values(g.round.provinces).forEach(p=>{p.owner='0';p.control=0;delete p.special;});g.round.provinces['2'].owner='1';return g;
}
function token(g:FullState,player:string,kind:TokenKind,strength=0){const t={id:`test-${g.round.nextOrder++}`,owner:player,kind,strength};g.round.players[player].hand.push(t);return t;}
function order(g:FullState,player:string,kind:TokenKind,target:string,strength=1,from?:string){const t=token(g,player,kind,strength);expect(place(g.round,player,{token:t.id,target,from})).toBeNull();return g.round.orders.at(-1)!;}

describe('полный набор компонентов',()=>{
 it('лобби принимает готовность только своего места и запускается хозяином после всех',()=>{
  let g=setupFull(2,unchanged,true);expect(g.phase).toBe('lobby');
  expect(act(g,'0',{type:'clan',clan:'crab'},unchanged).error).toBeTruthy();
  expect(act(g,'0',{type:'start'},unchanged).error).toBeTruthy();
  g=act(g,'1',{type:'ready',ready:true,name:'Гость'},unchanged).state;
  expect(g.lobby?.ready['1']).toBe(true);expect(g.lobby?.ready['0']).toBe(false);
  g=act(g,'0',{type:'ready',ready:true,name:'Хозяин'},unchanged).state;
  expect(act(g,'1',{type:'start'},unchanged).error).toBeTruthy();
  g=act(g,'1',{type:'ready',ready:false},unchanged).state;
  expect(act(g,'0',{type:'start'},unchanged).error).toBeTruthy();
  g=act(g,'1',{type:'ready',ready:true},unchanged).state;
  g=act(g,'0',{type:'start'},unchanged).state;expect(g.phase).toBe('objective');
  expect(act(g,'1',{type:'ready',ready:false},unchanged).error).toBeTruthy();
 });
 it('30 провинций, 11 территорий, симметричные границы, 7 столиц',()=>{const map=createMap();expect(Object.keys(map)).toHaveLength(30);expect(new Set(Object.values(map).map(p=>p.territory)).size).toBe(11);expect(Object.values(map).filter(p=>p.capital)).toHaveLength(7);for(const p of Object.values(map))for(const n of p.neighbors)expect(map[n].neighbors).toContain(p.id);});
 it('27 жетонов на каждый клан и по две карты территории',()=>{for(const clan of Object.keys(CLANS) as (keyof typeof CLANS)[])expect(clanTokens(clan,'0')).toHaveLength(27);expect(CARDS).toHaveLength(22);expect(Object.keys(OBJECTIVES)).toHaveLength(12);for(const t of new Set(CARDS.map(c=>c.territory)))expect(CARDS.filter(c=>c.territory===t)).toHaveLength(2);});
 it.each([2,3,4,5])('%i игроков получают правильное число владений и жетонов',n=>{const g=prepared(n);for(const id of g.seats){expect(Object.values(g.round.provinces).filter(p=>p.owner===id)).toHaveLength(({2:12,3:8,4:6,5:5} as Record<number,number>)[n]);expect(g.round.players[id].hand).toHaveLength(6);}expect(g.initiative).toHaveLength(4);});
 it('запрещает повторный клан и цель вне предложенных',()=>{let g=setupFull(2,unchanged);g=move(g,{type:'clan',clan:'crab'});expect(act(g,'1',{type:'clan',clan:'crab'},unchanged).error).toBeTruthy();g=move(g,{type:'clan',clan:'crane'});expect(act(g,'0',{type:'objective',objective:'fake'},unchanged).error).toBeTruthy();});
});
describe('длинные партии',()=>{
 it.each([2,3,4,5])('завершает пять раундов на %i игроков, сохраняя все жетоны',n=>{
  for(let seed=1;seed<=4;seed++){
   const shuffle=rng(seed);let g=setupFull(n,shuffle),steps=0;
   const clans=shuffle(Object.keys(CLANS));
   while(g.phase!=='finished'&&steps++<600){
    let a:Action;const id=g.active;
    switch(g.phase){
     case 'clan':a={type:'clan',clan:clans[+id]};break;
     case 'objective':a={type:'objective',objective:g.secrets[id].objectives[0]};break;
     case 'draft':a={type:'draft',province:shuffle(Object.values(g.round.provinces).filter(p=>p.owner===null))[0].id};break;
     case 'dragon':a={type:'dragon',token:g.round.players[id].hand.find(t=>t.kind!=='bluff')!.id};break;
     case 'upkeep':a={type:'pass'};break;
     case 'placement':a={type:'place',placement:shuffle(availablePlacements(g,id))[0]};break;
     case 'unicorn':a={type:'unicorn',ids:[]};break;
     case 'resolution':a={type:'continue'};break;
     default:throw Error(g.phase);
    }
    const result=act(g,id,a,shuffle);expect(result.error).toBeUndefined();g=result.state;
    const tokens=[...g.round.discarded,...Object.values(g.round.players).flatMap(p=>p.hand),...Object.values(g.secrets).flatMap(s=>[...s.pool,...s.aside]),...(!g.round.revealed?g.round.orders.map(o=>o.token):[])];
    const chosen=Object.values(g.round.players).filter(p=>p.clan).length;
    expect(tokens).toHaveLength(27*chosen);expect(new Set(tokens.map(t=>t.id)).size).toBe(27*chosen);
   }expect(g.phase).toBe('finished');expect(g.number).toBe(5);expect(g.winners.length).toBeGreaterThan(0);expect(g.results).toHaveLength(n);
  }
 });
});
describe('кланы и боевые уточнения',()=>{
 it('несколько атакующих синоби разрешены',()=>{const g=prepared();Object.values(g.round.provinces).forEach(p=>p.owner=null);order(g,'0','shinobi','1',2);order(g,'1','shinobi','1',1);expect(resolve(g.round).provinces['1'].owner).toBe('0');});
 it('Краб получает три защиты за открытый контроль',()=>{const g=prepared();g.round.provinces['1'].owner='0';g.round.provinces['1'].control=1;order(g,'1','shinobi','1',2);expect(resolve(g.round).provinces['1'].owner).toBe('0');});
 it('Журавль выигрывает ничью с защитником',()=>{const g=prepared();g.round.provinces['1'].owner='0';order(g,'0','army','1',2);order(g,'1','shinobi','1',2);expect(resolve(g.round).provinces['1'].owner).toBe('1');});
 it('Феникс игнорирует столицу, но не увеличивает силу против других атакующих',()=>{const g=prepared(3,['phoenix','crab','lion']);g.round.provinces['2'].owner='1';order(g,'0','shinobi','2',1);expect(resolve(g.round).provinces['2'].owner).toBe('0');order(g,'2','shinobi','2',2);expect(resolve(g.round).provinces['2'].owner).toBe('1');});
 it('блеф Льва защищает с силой 2, но без атаки не укрепляет',()=>{const g=prepared(2,['lion','crab']);g.round.provinces['1'].owner='0';order(g,'0','bluff','1',0);expect(resolve(g.round).provinces['1'].control).toBe(0);order(g,'1','shinobi','1',2);const r=resolve(g.round);expect(r.provinces['1'].owner).toBe('0');expect(r.provinces['1'].control).toBe(1);});
 it('порт допускает нападение через чужую границу',()=>{const g=prepared();g.round.provinces['1'].special={kind:'harbor'};g.round.provinces['1'].owner='1';g.round.provinces['2'].owner='1';order(g,'0','navy','1',3,'2');expect(resolve(g.round).provinces['1'].owner).toBe('0');});
 it('благословение нельзя положить на открытый приказ',()=>{const g=prepared();const o=order(g,'0','army','23');o.faceup=true;const t=token(g,'0','blessing',2);expect(placementError(g.round,'0',{token:t.id,target:'23',parent:o.id})).toBeTruthy();});
});
describe('карты территории',()=>{
 it.each(['harbor','honor','shrine','purpose','port','bushido','battlefield','levies','harvest','kami'])('применяет %s',id=>{let g=cardState(id);const c=CARDS.find(c=>c.id===id)!;g=move(g,{type:'card',card:id,provinces:['1','3','4'].slice(0,c.provinces)});expect(g.cards.find(c=>c.id===id)?.used).toBe(true);expect(g.active).toBe('1');});
 it('мир на чужой провинции укрепляет свою, ошибка не тратит карту',()=>{let g=cardState('peace');const before=JSON.stringify(g);expect(act(g,'0',{type:'card',card:'peace',provinces:['2']},unchanged).error).toBeTruthy();expect(JSON.stringify(g)).toBe(before);g=move(g,{type:'card',card:'peace',provinces:['2','1']});expect(g.round.provinces['2'].special?.kind).toBe('peace');expect(g.round.provinces['1'].control).toBe(2);});
 it('пиратский набег сжигает своё владение и укрепляет другое',()=>{let g=cardState('pirates');g=move(g,{type:'card',card:'pirates',provinces:['1','3']});expect(g.round.provinces['1'].owner).toBeNull();expect(g.round.provinces['3'].control).toBe(3);});
 it('Благословение земель снимает выжженную землю и даёт один открытый контроль',()=>{let g=cardState('bless');g.round.provinces['1'].special={kind:'scorched'};g.round.provinces['1'].owner=null;g=move(g,{type:'card',card:'bless',provinces:['1']});expect(g.round.provinces['1'].special).toBeUndefined();expect(g.round.provinces['1'].owner).toBe('0');expect(g.round.provinces['1'].control).toBe(1);});
 it('восстание снимает мир и даёт два контроля владельцу карты',()=>{let g=cardState('rebellion');g.round.provinces['1'].special={kind:'peace'};g=move(g,{type:'card',card:'rebellion',provinces:['1']});expect(g.round.provinces['1'].control).toBe(2);});
 it('шпионская сеть показывает руку только владельцу и убирает блеф',()=>{let g=cardState('spy');g=move(g,{type:'card',card:'spy',opponent:'1'});expect(g.secrets['0'].intel).toHaveLength(6);expect(g.round.players['1'].hand.some(t=>t.kind==='bluff')).toBe(false);expect(fullPlayerView(g,'1').secrets['0'].intel).toEqual([]);});
 it('обмен сохраняет число открытых контролей',()=>{let g=cardState('exchange');g.round.provinces['1'].control=3;g.round.provinces['2'].control=1;g=move(g,{type:'card',card:'exchange',provinces:['1','2']});expect(g.round.provinces['1'].owner).toBe('1');expect(g.round.provinces['2'].control).toBe(3);});
 it('страх снимает и мир, и выжженную землю',()=>{let g=cardState('fear');g.round.provinces['1'].special={kind:'peace'};g.round.provinces['2'].special={kind:'scorched'};g=move(g,{type:'card',card:'fear',sacrifice:'3',provinces:['1','2']});expect(g.round.provinces['3'].owner).toBeNull();expect(g.round.provinces['1'].special).toBeUndefined();expect(g.round.provinces['2'].special).toBeUndefined();});
 it('тёмные любимцы сначала показывают тайно, затем сбрасывают выбранный приказ',()=>{let g=cardState('dark');const o=order(g,'1','army','2');g=move(g,{type:'card',card:'dark',sacrifice:'1',orders:[o.id]});expect(g.pending?.kind).toBe('dark');expect(g.round.orders).toHaveLength(1);expect(fullPlayerView(g,'1').pending?.ids).toEqual([]);g=move(g,{type:'pending',order:o.id});expect(g.round.orders).toHaveLength(0);expect(g.active).toBe('0');});
 it('изгнание слабых заменяет размещение',()=>{let g=cardState('purge');const a=order(g,'1','army','2'),b=order(g,'1','army','2');const hand=g.round.players['0'].hand.find(t=>t.kind!=='bluff')!;g=move(g,{type:'card',card:'purge',hand:[hand.id],orders:[a.id,b.id]});expect(g.round.orders).toHaveLength(0);expect(g.active).toBe('1');});
 it('оживление возвращает жетон открыто и оставляет обычное размещение',()=>{let g=cardState('animate');const t={id:'dead',kind:'army' as const,strength:2,owner:'0'};g.round.discarded.push(t);g=move(g,{type:'card',card:'animate',sacrifice:'1',discard:[t.id],placement:{token:t.id,target:'3'}});expect(g.round.orders[0].faceup).toBe(true);expect(g.active).toBe('0');});
 it.each(['promotion','reinforce'])('%s возвращает жетоны и требует обмен руки',id=>{let g=cardState(id);const count=id==='promotion'?1:2;const ts=Array.from({length:count},(_,i)=>({id:'dead'+i,kind:'army' as const,strength:2,owner:'0'}));g.round.discarded.push(...ts);g=move(g,{type:'card',card:id,discard:ts.map(t=>t.id)});expect(g.pending?.kind).toBe('exchange');const returned=g.round.players['0'].hand.filter(t=>t.kind!=='bluff').slice(0,count);g=move(g,{type:'pending',returns:returned.map(t=>({token:t.id,to:'pool'}))});expect(g.pending).toBeNull();expect(g.active).toBe('1');});
 it('защита благословения распространяется на карты и способности',()=>{const g=cardState('dark'),o=order(g,'1','army','2');const t=token(g,'1','blessing',2);place(g.round,'1',{token:t.id,target:'2',parent:o.id});const r=act(g,'0',{type:'card',card:'dark',sacrifice:'1',orders:[o.id]},unchanged);expect(r.error).toBeTruthy();expect(r.state.round.provinces['1'].owner).toBe('0');});
});
describe('тайная информация и клиентский протокол',()=>{
 it('проекция не содержит резерв, будущую инициативу, чужие цели и ещё не полученные карты',()=>{const g=prepared();const v=fullPlayerView(g,null);expect(v.initiative).toEqual([]);for(const id of g.seats){expect(v.secrets[id]).toEqual({pool:[],objectives:[],objective:null,aside:[],intel:[]});expect(v.round.players[id].hand).toEqual([]);}expect(v.cards.every(c=>c.id==='')).toBe(true);});
 it('проверяет актёра и откатывает всю транзакцию',()=>{const g=prepared();const before=JSON.stringify(g);expect(act(g,nextID(g.active),{type:'place',placement:availablePlacements(g,g.active)[0]},unchanged).error).toBeTruthy();expect(JSON.stringify(g)).toBe(before);});
 it('локальные клиенты используют серверный автомат и скрытые журналы',()=>{
  const multiplayer=Local(),clients=['0','1',undefined].map(playerID=>Client({game:BattleForRokugan,numPlayers:2,playerID,multiplayer,debug:false}));clients.forEach(c=>c.start());
  try {const [a,b,watch]=clients;a.moves.act({type:'ready',ready:true,name:'A'});b.moves.act({type:'ready',ready:true,name:'B'});a.moves.act({type:'start'});expect(new Set(Object.values(a.getState()!.G.round.players).map((p:any)=>p.clan)).size).toBe(2);expect(a.getState()!.G.phase).toBe('objective');expect(watch.getState()!.G.secrets['0'].objectives).toEqual([]);expect(b.log?.find(e=>e.action.payload.type==='act')?.action.payload.args).toBeNull();}finally{clients.forEach(c=>c.stop());}
 });
});
describe('смена раундов, способности и окончательный подсчёт',()=>{
 it('первый игрок возвращает блеф в отложенные жетоны до следующего раунда',()=>{let g=prepared(3);g.phase='placement';g.active=g.first='0';const o=order(g,'1','bluff','2',0);g=move(g,{type:'first',order:o.id});expect(g.firstUsed).toBe(true);expect(g.secrets['1'].aside[0].id).toBe(o.token.id);expect(g.secrets['0'].intel[0].kind).toBe('bluff');expect(fullPlayerView(g,'2').secrets['0'].intel).toEqual([]);g.phase='resolution';g=move(g,{type:'continue'});expect(g.secrets['1'].aside).toEqual([]);expect(g.round.players['1'].hand.some(t=>t.id===o.token.id)).toBe(true);});
 it('вдвоём карту первого игрока применить нельзя',()=>{const g=prepared();g.active=g.first='0';const o=order(g,'1','army','2');expect(act(g,'0',{type:'first',order:o.id},unchanged).error).toBeTruthy();});
 it('Скорпион смотрит после размещения, заканчивает просмотр и передаёт ход',()=>{let g=prepared(2,['scorpion','crab']);g.active='0';const o=order(g,'1','army','2');g=move(g,{type:'place',placement:availablePlacements(g,'0')[0],peek:o.id});expect(g.pending?.kind).toBe('intel');expect(g.active).toBe('0');expect(g.scorpionUsed).toBe(true);expect(g.secrets['0'].intel[0].id).toBe(o.token.id);g=move(g,{type:'pending'});expect(g.active).toBe('1');});
 it('Единорог меняет жетоны на поле; разведка старой позиции очищается',()=>{let g=prepared(2,['unicorn','crab']);g.phase='unicorn';g.active='0';const a=order(g,'0','army','6',2),b=order(g,'0','shinobi','2',3);g.round.players['1'].knowledge[a.id]=a.token;g=move(g,{type:'unicorn',ids:[a.id,b.id]});expect(g.round.orders.find(o=>o.id===a.id)?.token.kind).toBe('shinobi');expect(g.round.players['1'].knowledge[a.id]).toBeUndefined();expect(g.phase).toBe('resolution');});
 it('нейтральная инициатива при ничьей идёт ближайшему справа, а не прежнему первому',()=>{let g=prepared(3);g.phase='resolution';g.first=g.active='0';g.initiative=['provinces'];g=move(g,{type:'continue'});expect(g.first).toBe('2');});
 it('неиспользованная карта переходит новому полному владельцу, использованная не возвращается',()=>{let g=prepared(2,['unicorn','crab']);g.phase='unicorn';g.active='0';for(const p of Object.values(g.round.provinces).filter(p=>p.territory==='dragon'))p.owner='1';const c=g.cards.find(c=>c.territory==='dragon')!;c.owner='0';c.revealed=true;g=move(g,{type:'unicorn',ids:[]});expect(g.cards.find(c=>c.territory==='dragon')?.owner).toBe('1');g.cards.find(c=>c.territory==='dragon')!.used=true;g.phase='unicorn';g.round.revealed=false;g=move(g,{type:'unicorn',ids:[]});expect(g.cards.find(c=>c.territory==='dragon')?.used).toBe(true);});
 it.each(Object.keys(CLANS))('цель %s выполняется столицей даже при владении остальной территорией',clan=>{const g=prepared();for(const p of Object.values(g.round.provinces))p.owner=p.territory===clan?'0':null;expect(objectivePoints(g.round,clan,'0')).toBe(OBJECTIVES[clan].points);});
 it('все остальные цели вычисляются из карты, с ничьей для смирения',()=>{const g=prepared();Object.values(g.round.provinces).forEach(p=>p.owner='0');for(const id of ['empire','coast','shadow','influence'])expect(objectivePoints(g.round,id,'0')).toBe(OBJECTIVES[id].points);Object.values(g.round.provinces).forEach(p=>p.owner=null);expect(objectivePoints(g.round,'humility','0')).toBe(10);expect(objectivePoints(g.round,'empire','0')).toBe(0);});
 it('Бусидо заменяет печатную честь, а защита добавляет один цветок',()=>{const g=prepared();Object.values(g.round.provinces).forEach(p=>p.owner=null);g.round.provinces['1'].owner='0';g.round.provinces['1'].special={kind:'honor',value:4};expect(score(g.round.provinces,'0').flowers).toBe(4);g.round.provinces['1'].special={kind:'defense',value:2};expect(score(g.round.provinces,'0').flowers).toBe(2);});
 it('равные честь, территории и провинции дают совместную победу',()=>{let g=prepared(2,['unicorn','crab']);Object.values(g.round.provinces).forEach(p=>{p.owner=null;p.control=0;});g.secrets['0'].objective='dragon';g.secrets['1'].objective='crane';g.number=5;g.phase='unicorn';g.active='0';g=move(g,{type:'unicorn',ids:[]});expect(g.winners).toEqual(['0','1']);});
});
function nextID(id:string){return id==='0'?'1':'0';}

describe('новый игровой стол',()=>{
 it('выбор клана и случайная раздача сохраняют занятый клан и уникальность',()=>{
  let g=setupFull(5,unchanged,true);
  g=act(g,'2',{type:'lobby-clan',clan:'crab'},unchanged).state;
  expect(act(g,'1',{type:'lobby-clan',clan:'crab'},unchanged).error).toBeTruthy();
  expect(act(g,'1',{type:'random-clans'},unchanged).error).toBeTruthy();
  g=act(g,'0',{type:'random-clans'},unchanged).state;
  expect(g.lobby!.clans!['2']).toBe('crab');expect(new Set(Object.values(g.lobby!.clans!)).size).toBe(5);
  for(const id of g.seats)g=act(g,id,{type:'ready',ready:true},unchanged).state;
  g=act(g,'0',{type:'start'},unchanged).state;
  expect(g.phase).toBe('objective');expect(g.round.players['2'].clan).toBe('crab');expect(g.cards.every(c=>c.owner===null&&!c.revealed)).toBe(true);
 });
 it('карты территорий не выдаются после подготовки даже при полном контроле',()=>{
  const g=prepared();expect(g.number).toBe(1);expect(g.cards.every(c=>c.owner===null&&!c.revealed)).toBe(true);
 });
 it('исправляет соседства по изображению поля',()=>{
  const p=createMap();expect(p['2'].neighbors).toContain('4');expect(p['5'].neighbors).toContain('8');expect(p['6'].neighbors).toContain('7');
  expect(p['4'].neighbors).not.toContain('5');expect(p['4'].neighbors).not.toContain('8');expect(p['11'].neighbors).not.toContain('23');
 });
 it('свободные правки требуют режима, сохраняют жетоны и не раскрывают чужую руку',()=>{
  let g=prepared();const who='1',t=g.round.players[who].hand[0];
  expect(act(g,who,{type:'manual-control',province:'2',owner:who,control:5},unchanged).error).toBeTruthy();
  expect(act(g,who,{type:'mode',enabled:true},unchanged).error).toBeUndefined();
  g=act(g,'0',{type:'mode',enabled:true},unchanged).state;
  g=act(g,who,{type:'manual-control',province:'2',owner:who,control:5},unchanged).state;expect(g.round.provinces['2'].control).toBe(5);
  g=act(g,who,{type:'manual-place',placement:{token:t.id,target:'2',from:'sea'}},unchanged).state;const o=g.round.orders.at(-1)!;
  expect(o.token.id).toBe(t.id);expect(fullPlayerView(g,'0').round.orders.at(-1)!.token).toBeNull();
  g=act(g,who,{type:'manual-move',order:o.id,placement:{token:'',target:'29'}},unchanged).state;expect(g.round.orders.at(-1)!.target).toBe('29');
  g=act(g,who,{type:'manual-return',order:o.id},unchanged).state;expect(g.round.orders).toHaveLength(0);expect(g.round.players[who].hand.filter(x=>x.id===t.id)).toHaveLength(1);
  const invalid=act(g,who,{type:'manual-control',province:'2',owner:who,control:-2},unchanged);expect(invalid.error).toBeTruthy();expect(invalid.state).toEqual(g);
 });
 it('раскрывает провинции синхронно, не меняя одновременный расчёт боёв',()=>{
  let g=prepared();g.cinematic=true;g.manual=true;
  Object.values(g.round.provinces).forEach(p=>p.owner=null);g.round.provinces['1'].owner='0';
  order(g,'0','army','2',5,'1');const before=structuredClone(g.round.provinces),expected=resolve(g.round);
  g=act(g,'0',{type:'manual-resolve'},unchanged).state;expect(g.phase).toBe('reveal');
  expect(fullPlayerView(g,'1').round.provinces).toEqual(before);
  expect(act(g,g.first==='0'?'1':'0',{type:'reveal-next'},unchanged).error).toBeTruthy();
  while(g.phase==='reveal'){
   g=move(g,{type:'reveal-next'});const a=fullPlayerView(g,'0'),b=fullPlayerView(g,'1');expect(a.round.provinces).toEqual(b.round.provinces);
   expect(a.round.battles).toEqual(b.round.battles);
  }
  expect(g.round.provinces).toEqual(expected.provinces);expect(g.phase).toBe('resolution');
 });
});

describe('ручная коррекция и раскрытие занятых провинций',()=>{
 it('взятая карта территории видна всем, а карта под полем — никому',()=>{
  const g=prepared();g.cards[0].owner='0';g.cards[0].revealed=true;
  for(const viewer of ['0','1',null,undefined])expect(fullPlayerView(g,viewer).cards[0].id).toBe(g.cards[0].id);
  for(const viewer of ['0','1',null])expect(fullPlayerView(g,viewer).cards[1].id).toBe('');
 });
 it('позволяет армию на морской границе для блефа, но запрещает нападение на себя',()=>{
  const g=prepared(),p=Object.values(g.round.provinces).find(p=>p.coastal)!;p.owner='1';
  const t=token(g,'0','army',2);expect(place(g.round,'0',{token:t.id,target:p.id,from:'sea'})).toBeNull();
  expect(resolve(g.round).removed.some(r=>r.order===g.round.orders.at(-1)!.id)).toBe(true);
  g.round.orders=[];p.owner='0';const other=token(g,'0','army',1);
  expect(placementError(g.round,'0',{token:other.id,target:p.id,from:'sea'})).toContain('свою');
 });
 it('показывает разгром до боёв и снимает приказы на выходящих границах',()=>{
  let g=prepared();g.manual=true;g.cinematic=true;
  Object.values(g.round.provinces).forEach(p=>p.owner=null);
  const p=g.round.provinces['2'],source=p.neighbors[0];p.owner='1';g.round.provinces[source].owner='0';
  order(g,'0','raid',p.id,0);order(g,'1','army',source,2,p.id);
  const attack=g.round.orders.at(-1)!.id;
  g=act(g,'0',{type:'manual-resolve'},unchanged).state;
  expect(g.replay!.frames![0].kind).toBe('raid');
  g=move(g,{type:'reveal-next'});const view=fullPlayerView(g,'1');
  expect(view.round.provinces[p.id].special?.kind).toBe('scorched');
  expect(view.round.orders.some(o=>o.id===attack)).toBe(false);
  expect(view.round.battles).toEqual([]);expect(view.replay!.frames).toBeUndefined();
 });
 it('отменяет обычный ход после включения ручного режима, не передавая снимок клиентам',()=>{
  let g=prepared(),before=structuredClone(g.round),active=g.active;
  g=move(g,{type:'place',placement:availablePlacements(g,g.active)[0]});
  expect(g.undoState).toBeDefined();expect(fullPlayerView(g,'0').undoState).toBeUndefined();expect(fullPlayerView(g).undoState).toBeUndefined();
  g=act(g,'1',{type:'mode',enabled:true},unchanged).state;
  const revision=g.revision;g=act(g,'1',{type:'manual-undo'},unchanged).state;
  expect(g.round).toEqual(before);expect(g.active).toBe(active);expect(g.revision).toBe(revision+1);expect(g.canUndo).toBe(false);
  expect(act(g,'1',{type:'manual-undo'},unchanged).error).toBeTruthy();
 });
 it('меняет жетон на столе с жетоном руки без дублирования и отменяет замену',()=>{
  let g=prepared();g.manual=true;const placement=availablePlacements(g,'0')[0];g=act(g,'0',{type:'manual-place',placement},unchanged).state;
  const order=g.round.orders[0],old=order.token.id,replacement=g.round.players['0'].hand[0].id;
  g=act(g,'0',{type:'manual-swap',order:order.id,token:replacement},unchanged).state;
  expect(g.round.orders[0].token.id).toBe(replacement);expect(g.round.players['0'].hand.some(t=>t.id===old)).toBe(true);
  expect(g.round.players['0'].hand.some(t=>t.id===replacement)).toBe(false);
  expect(fullPlayerView(g,'1').round.orders[0].token).toBeNull();
  g=act(g,'1',{type:'manual-undo'},unchanged).state;expect(g.round.orders[0].token.id).toBe(old);
 });
 it('раскрывает только провинции с приказами, включая блеф, и пропускает пустые',()=>{
  let g=prepared();g.cinematic=true;g.manual=true;
  const t=g.round.players['0'].hand.find(t=>t.kind==='bluff')!;
  g=act(g,'0',{type:'manual-place',placement:{token:t.id,target:'7'}},unchanged).state;
  g=act(g,'0',{type:'manual-resolve'},unchanged).state;expect(g.replay!.steps).toEqual(['7']);
  g=move(g,{type:'reveal-next'});expect(g.phase).toBe('reveal');g=move(g,{type:'reveal-next'});expect(g.phase).toBe('resolution');
 });
});

describe('единый журнал и показ сброшенных жетонов',()=>{
 it('«Изгнание слабых» показывает всем сброшенные жетоны и пишет их по-русски',()=>{
  let g=cardState('purge');
  const a=order(g,'1','army','2',3),b=order(g,'1','army','2',1),h=token(g,'0','army',2);
  g=move(g,{type:'card',card:'purge',orders:[a.id,b.id],hand:[h.id]});
  expect(g.flash?.tokens.map(x=>x.token.strength)).toEqual([1]);
  expect(g.flash?.text).toContain('армия 1');
  expect(g.log.some(l=>l.includes('армия 3'))).toBe(true);
  expect(g.log.some(l=>l.includes('сбрасывает из руки армия 2'))).toBe(true);
 });
 it('бои пишутся в общий журнал, но игрокам видны только после раскрытия',()=>{
  let g=prepared();g.phase='placement';g.manual=true;g.cinematic=true;
  order(g,'1','army','2',2);
  const before=g.log.length;
  const r=act(g,'0',{type:'manual-resolve'},unchanged);expect(r.error).toBeUndefined();g=r.state;
  expect(g.log.some(l=>l.startsWith('Бой за'))).toBe(true);
  expect(fullPlayerView(g,'0').log.length).toBe(before);
  while(g.phase==='reveal')g=act(g,g.active,{type:'reveal-next'},unchanged).state;
  expect(fullPlayerView(g,'0').log.some(l=>l.startsWith('Бой за'))).toBe(true);
 });
 it('игрок видит свой резерв, но не чужой; число жетонов в резерве видно всем',()=>{
  const g=prepared(),v=fullPlayerView(g,'0');
  expect(v.secrets['0'].pool.length).toBe(g.secrets['0'].pool.length);
  expect(v.secrets['1'].pool).toEqual([]);
  expect(v.reserve?.['1']).toBe(g.secrets['1'].pool.length);
 });
});
