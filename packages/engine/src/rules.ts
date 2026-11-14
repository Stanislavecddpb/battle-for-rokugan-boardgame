import type { Battle, Order, Placement, PlayerID, PlayerView, Province, RoundState, Token } from './types';

const military = (t: Token) => ['army', 'navy', 'shinobi'].includes(t.kind);
const blocked = (p: Province) => p.special?.kind === 'peace' || p.special?.kind === 'scorched';
const coast = (p: Province) => p.coastal || p.special?.kind === 'harbor';
const borderKey = (o: Pick<Order, 'target' | 'from'>) => o.from === 'sea' ? `sea:${o.target}` : o.from ? [o.from, o.target].sort().join(':') : null;
const protectedOrder = (s: RoundState, id: string) => s.orders.some(o => o.parent === id);

/** Public spatial constraints only: deliberately illegal tokens are valid bluffs (FAQ 1.1). */
export function placementError(s: RoundState, player: PlayerID, input: Placement): string | null {
  if (s.revealed) return 'Приказы уже раскрыты.';
  if (!input || typeof input!=='object' || typeof input.token!=='string' || typeof input.target!=='string' || !Object.hasOwn(s.players,player) || !Object.hasOwn(s.provinces,input.target)) return 'Некорректный приказ.';
  if(input.from!==undefined && (typeof input.from!=='string' || (input.from!=='sea' && !Object.hasOwn(s.provinces,input.from)))) return 'Неизвестная граница.';
  if(input.parent!==undefined && typeof input.parent!=='string') return 'Некорректный родительский приказ.';
  const p = s.players[player], dest = s.provinces[input?.target];
  const token = p?.hand.find(t => t.id === input?.token);
  if (!p || !token || !dest) return 'Неизвестный игрок, жетон или провинция.';
  if (blocked(dest)) return 'Мир и выжженная земля запрещают размещение.';
  if (dest.special?.kind === 'shrine' && dest.owner !== player) return 'Святилище защищает провинцию.';
  if (input.parent) {
    const parent = s.orders.find(o => o.id === input.parent);
    if (token.kind !== 'blessing' || !parent || parent.faceup || parent.player !== player || parent.parent || parent.target !== input.target || parent.from !== input.from) return 'Выберите свой закрытый приказ для благословения.';
    return null;
  }
  if (token.kind === 'blessing') return 'Благословение кладётся поверх своего приказа.';
  if (input.from) {
    if(dest.owner===player)return 'Нельзя нападать на свою провинцию.';
    if (input.from === 'sea') {
      if (!dest.coastal) return 'У провинции нет морской границы. Порт атакуют через сухопутную границу.';
    } else {
      const source = s.provinces[input.from];
      if (!source || !source.neighbors.includes(dest.id)) return 'Провинции не имеют общей границы.';
      if (blocked(source)) return 'Нельзя использовать границу мира или выжженной земли.';
      if (source.special?.kind === 'shrine' && source.owner !== player) return 'Чужое святилище защищает границы.';
      if (!p.ronin && source.owner !== player && dest.special?.kind!=='harbor') return 'Нет своей провинции для нападения.';
    }
    if (s.orders.some(o => !o.parent && borderKey(o) === borderKey(input))) return 'На границе уже есть приказ.';
  }
  return null;
}

export function place(s: RoundState, player: string, input: Placement): string | null {
  const error = placementError(s, player, input);
  if (error) return error;
  const hand = s.players[player].hand;
  const at = hand.findIndex(t => t.id === input.token);
  s.orders.push({ id: `order-${s.nextOrder++}`, player, token: hand.splice(at, 1)[0], target: input.target, ...(input.from ? {from: input.from} : {}), ...(input.parent ? {parent: input.parent} : {}) });
  return null;
}

export function tokenLegal(s: RoundState, o: Order): boolean {
  const dest = s.provinces[o.target], own = dest.owner === o.player, ronin = s.players[o.player].ronin;
  const center = !o.from;
  if (blocked(dest) || (dest.special?.kind === 'shrine' && !own)) return false;
  if (o.from && o.from !== 'sea' && blocked(s.provinces[o.from])) return false;
  switch (o.token.kind) {
    case 'army': return center ? own : o.from !== 'sea' && !own && (ronin || s.provinces[o.from!]?.owner === o.player);
    case 'navy': return coast(dest) && (center ? own : o.from === 'sea' || dest.special?.kind === 'harbor') && (center || !own);
    case 'shinobi': return center;
    case 'diplomacy': return center && own && !ronin && dest.special?.kind !== 'battlefield';
    case 'raid': return center && !own && !ronin && dest.special?.kind !== 'battlefield' && (
      dest.neighbors.some(id => s.provinces[id].owner === o.player && !blocked(s.provinces[id])) ||
      s.orders.some(x => x.player === o.player && x.target === o.target && !x.from && x.token.kind === 'shinobi' && tokenLegal(s,x))
    );
    case 'bluff': return center && own && s.players[o.player].clan==='lion';
    case 'blessing': return false; // handled as a stack
  }
}

export function scout(s: RoundState, player: string, orderID: string): string | null {
  const p=s.players[player], o=s.orders.find(x=>x.id===orderID);
  if (s.revealed || !p || p.scouts < 1 || !o || o.player===player || o.parent || protectedOrder(s,o.id)) return 'Этот приказ нельзя разведать.';
  p.scouts--; p.knowledge[o.id]={...o.token}; return null;
}
export function shugenja(s: RoundState, player: string, orderID: string): string | null {
  const p=s.players[player], o=s.orders.find(x=>x.id===orderID);
  if (s.revealed || !p || p.shugenja < 1 || !o || o.player===player || o.parent || protectedOrder(s,o.id)) return 'Этот приказ нельзя удалить.';
  p.shugenja--; s.orders=s.orders.filter(x=>x.id!==o.id);
  if(o.token.kind==='bluff') s.players[o.player].hand.push(o.token); else s.discarded.push(o.token);
  return null;
}

/** Atomic resolution: validate against pre-battle ownership; apply captures only after every strength is computed. */
export interface ResolutionFrame {kind:'invalid'|'raid'|'diplomacy'|'battle';targets:string[];provinces:Record<string,Province>;removed:string[];battles:Battle[]}
export function resolve(input: RoundState, frames?:ResolutionFrame[]): RoundState {
  // boardgame.io wraps moves/hooks in Immer proxies, which structuredClone cannot clone.
  // Game state is intentionally JSON-only, matching the network/storage contract.
  const s:RoundState=JSON.parse(JSON.stringify(input));
  if(input.revealed) return s;
  s.revealed=true; s.battles=[]; s.removed=[];
  let active: Order[]=[];
  for(const o of s.orders.filter(x=>!x.parent)) {
    const blessings=s.orders.filter(x=>x.parent===o.id);
    if(!tokenLegal(s,o) || (blessings.length>0 && !military(o.token))) {
      let reason='Жетон не соответствует правилам выбранной позиции.';
      if(o.token.kind==='bluff')reason='Блеф: снят перед боем.';
      else if(o.token.kind==='diplomacy')reason=s.provinces[o.target].owner!==o.player?'Дипломатия действует только в своей провинции. Здесь контроль другого клана или нейтральная земля.':s.provinces[o.target].special?.kind==='battlefield'?'Поле битвы запрещает дипломатию.':s.players[o.player].ronin?'Ронин не может применять дипломатию.':'Дипломатия должна лежать в центре своей провинции.';
      else if(o.token.kind==='army'&&o.from==='sea')reason='Армия не атакует с моря: этот приказ считается блефом.';
      else if(blessings.length&&!military(o.token))reason='Благословение допускается только на армии, флоте или синоби.';
      s.removed.push({order:o.id,reason});
      for(const item of blessings)s.removed.push({order:item.id,reason:'Благословение снято вместе с приказом, на котором лежало.'});
    } else active.push(o,...blessings);
  }
  const hidden=new Set<string>();
  const frame=(kind:ResolutionFrame['kind'],targets:string[],battles:Battle[]=[])=>{for(const r of s.removed)hidden.add(r.order);frames?.push(JSON.parse(JSON.stringify({kind,targets,provinces:s.provinces,removed:[...hidden],battles})));};
  if(s.removed.length)frame('invalid',[...new Set(s.orders.filter(o=>s.removed.some(r=>r.order===o.id)).map(o=>o.target))]);
  for(const kind of ['raid','diplomacy'] as const) {
    // Same-type effects are simultaneous; e.g. two adjacent raids both burn their targets.
    const targets=[...new Set(active.filter(o=>o.token.kind===kind).map(o=>o.target))];
    for(const target of targets) {
      const p=s.provinces[target];
      p.special={kind:kind==='raid'?'scorched':'peace'};
      if(kind==='raid') { p.owner=null; p.control=0; }
    }
    active=active.filter(o=> {
      const removed=targets.includes(o.target) || (!!o.from && targets.includes(o.from));
      if(removed) s.removed.push({order:o.id,reason:kind==='raid'?'Набег':'Дипломатия'});
      return !removed;
    });
    if(targets.length)frame(kind,targets);
  }
  const changes: {id:string;owner:string|null;control:number}[]=[];
  for(const p of Object.values(s.provinces)) {
    const tokens=active.filter(o=>o.target===p.id);
    if(!tokens.length) continue;
    const strengths: Record<string,number>={};
    for(const o of tokens) strengths[o.player]=(strengths[o.player]??0)+o.token.strength;
    for(const o of tokens.filter(o=>o.token.kind==='bluff')) strengths[o.player]+=2;
    const defense=p.defense+p.control*(p.owner && s.players[p.owner].clan==='crab'?3:1)+(p.special?.kind==='defense'?p.special.value:0)+(p.owner?strengths[p.owner]??0:0);
    const attacks=Object.entries(strengths).filter(([id])=>id!==p.owner);
    const maxAttack=Math.max(-1,...attacks.map(([,v])=>v));
    const leaders=attacks.filter(([,v])=>v===maxAttack);
    const crane=leaders.find(([id])=>s.players[id].clan==='crane');
    const top=leaders[0];
    const effectiveDefense=top&&s.players[top[0]].clan==='phoenix'&&p.capital?defense-p.defense:defense;
    const winner=crane&&maxAttack>=defense?crane[0]:leaders.length===1&&maxAttack>effectiveDefense?top[0]:p.owner;
    const battle: Battle={province:p.id,strengths,defense,previous:p.owner,winner};
    s.battles.push(battle);
    const defended=attacks.length>0 || tokens.some(o=>o.player===p.owner && military(o.token));
    changes.push({id:p.id,owner:winner,control:winner===p.owner ? p.control+(winner&&defended?1:0):0});
  }
  const shown:Battle[]=[];
  for(const c of changes) {Object.assign(s.provinces[c.id],{owner:c.owner,control:c.control});for(const o of active.filter(o=>o.target===c.id))hidden.add(o.id);shown.push(s.battles.find(b=>b.province===c.id)!);frame('battle',[c.id],shown);}
  for(const o of s.orders) {
    if(o.token.kind==='bluff') s.players[o.player].hand.push(o.token); else s.discarded.push(o.token);
  }
  return s;
}

/** Explicit projection, including spectators: never spread private player state into a response. */
export function playerView(s: RoundState, viewer?: string | null): PlayerView {
  return {
    provinces:structuredClone(s.provinces),nextOrder:s.nextOrder,revealed:s.revealed,
    discarded:structuredClone(s.discarded), battles:structuredClone(s.battles),removed:structuredClone(s.removed),
    players:Object.fromEntries(Object.entries(s.players).map(([id,p])=>[id,{
      name:p.name,clan:p.clan,scouts:p.scouts,shugenja:p.shugenja,ronin:p.ronin,
      hand:viewer===id?structuredClone(p.hand):[],handCount:p.hand.length,
      knowledge:viewer===id?structuredClone(p.knowledge):{}
    }])),
    orders:s.orders.map(o=>({id:o.id,player:o.player,target:o.target,from:o.from,parent:o.parent,faceup:o.faceup,
      token:s.revealed || o.faceup || viewer===o.player || o.token.kind==='blessing' ? {...o.token} : (viewer && s.players[viewer]?.knowledge[o.id] ? {...s.players[viewer].knowledge[o.id]}:null)
    }))
  };
}

export function territoryOwners(provinces: Record<string, Province>): Record<string,string|null> {
  return Object.fromEntries([...new Set(Object.values(provinces).map(p=>p.territory))].map(t=> {
    const ps=Object.values(provinces).filter(p=>p.territory===t && p.special?.kind!=='scorched');
    return [t,ps.length && ps[0].owner && ps.every(p=>p.owner===ps[0].owner)?ps[0].owner:null];
  }));
}
/** Objectives must be evaluated by their own verified card handlers, not supplied by a client. */
export function score(provinces:Record<string,Province>, player:string) {
  const rows=scoreBreakdown(provinces,player);
  const territories=rows.filter(r=>r.bonus>0).length;
  const flowers=rows.reduce((sum,r)=>sum+r.flowers,0),defense=rows.reduce((sum,r)=>sum+r.defense,0);
  return {flowers,defense,territories,total:flowers+defense+5*territories};
}
/** Shared by the authoritative final score and its province-by-province explanation. */
export function scoreBreakdown(provinces:Record<string,Province>,player:string){
 const owners=territoryOwners(provinces),all=Object.values(provinces);
 return [...new Set(all.filter(p=>p.owner===player).map(p=>p.territory))].map(territory=>{
  const ps=all.filter(p=>p.territory===territory&&p.owner===player).map(p=>{
   const excluded=!!p.shadowlands||p.special?.kind==='scorched';
   const flowers=excluded?0:p.special?.kind==='honor'&&p.special.value===4?4:p.honor+(p.special?.kind==='honor'?p.special.value:p.special?.kind==='defense'?1:0);
   return {id:p.id,name:p.name,flowers,defense:excluded?0:p.control,excluded,
    note:p.shadowlands?'Земли Тени: очки не начисляются':p.special?.kind==='scorched'?'Выжженная земля':p.special?.kind==='honor'&&p.special.value===4?'Бусидо: 4 вместо печатной чести':p.special?.kind==='honor'?`Печатная честь ${p.honor} + бонус ${p.special.value}`:p.special?.kind==='defense'?`Печатная честь ${p.honor} + 1 за жетон защиты`:'Печатная честь'};
  });
  const complete=owners[territory]===player,bonus=complete&&!all.some(p=>p.territory===territory&&p.shadowlands)?5:0;
  const flowers=ps.reduce((n,p)=>n+p.flowers,0),defense=ps.reduce((n,p)=>n+p.defense,0);
  return {territory,provinces:ps,complete,bonus,flowers,defense,total:flowers+defense+bonus};
 });
}
