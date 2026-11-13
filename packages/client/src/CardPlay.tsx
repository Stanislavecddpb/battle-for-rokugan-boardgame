import {useEffect,useState} from 'react';
import {CARDS,type Action,type FullState,type Token} from '@rokugan/engine';
import {TokenArt} from './Art';

type Draft={id:string;started:boolean;provinces:string[];orders:string[];discard:string[];hand:string[];sacrifice?:string;opponent?:string;placement?:Action['placement'];revision:number};
export type CardStep='sacrifice'|'discard'|'hand'|'order'|'province'|'player'|'placement'|'ready';
const support:Record<string,string>={scout:'Разведчик',shugenja:'Сюгэндзя',first:'Первый игрок'};
export function cardStep(d:Draft,g:FullState,viewer:string):CardStep{
 const c=CARDS.find(c=>c.id===d.id);
 if(support[d.id])return d.orders.length?'ready':'order';
 if(!c)return 'ready';
 if(c.sacrifice&&!d.sacrifice)return 'sacrifice';
 if(d.discard.length<(c.discard??0))return 'discard';
 if(c.id==='purge'&&!d.hand.length)return 'hand';
 if(d.orders.length<(c.orders??0))return 'order';
 if(c.opponent&&!d.opponent)return 'player';
 let count=c.provinces??0;
 if(d.provinces.length){const p=g.round.provinces[d.provinces[0]];if(c.id==='pirates'&&p.owner!==viewer||c.id==='peace'&&(p.owner===viewer||p.owner===null))count=1;}
 if(d.provinces.length<count)return 'province';
 if(c.id==='animate'&&!d.placement)return 'placement';
 return 'ready';
}
export function cardProvinceError(d:Draft,g:FullState,viewer:string,id:string):string|null{
 const p=g.round.provinces[id];
 if(d.provinces.includes(id))return 'Выберите другую провинцию.';
 if(d.id==='exchange')return d.provinces.length?(p.owner===null||p.owner===viewer?'Теперь нажмите провинцию соперника.':null):(p.owner!==viewer?'Сначала нажмите свою провинцию.':null);
 if(['purpose','harvest'].includes(d.id)&&p.owner!==viewer)return 'Нажмите свою провинцию.';
 if(d.provinces.length&&['pirates','peace'].includes(d.id)&&p.owner!==viewer)return 'Бонус контроля нужно положить в свою провинцию.';
 if(['honor','port','bushido','levies','kami'].includes(d.id)&&p.shadowlands)return 'Выберите провинцию вне Земель Тени.';
 if(d.id==='harbor'&&p.coastal)return 'Выберите внутреннюю провинцию.';
 if(d.id==='bless'&&p.special?.kind!=='scorched')return 'Выберите провинцию с жетоном выжженной земли.';
 if(d.id==='rebellion'&&p.special?.kind!=='peace')return 'Выберите провинцию с жетоном мира.';
 if(d.id==='fear'&&!p.special)return 'Выберите провинцию с особым жетоном.';
 return null;
}
export function useCardPlay(g:FullState|undefined,viewer:string,send:(a:Action)=>void){
 const [draft,setDraft]=useState<Draft|null>(null),[message,setMessage]=useState(''),[attempted,setAttempted]=useState(false),[spy,setSpy]=useState<{player:string;tokens:Token[]}|null>(null);
 const step=draft&&g?cardStep(draft,g,viewer):null;
 const card=CARDS.find(c=>c.id===draft?.id),playing=!!draft?.started;
 useEffect(()=>{setDraft(null);setMessage('');setSpy(null);},[g?.active,g?.phase,viewer]);
 useEffect(()=>{if(!g||!draft||g.revision<=draft.revision)return;const used=support[draft.id]?g.log.at(-1)?.includes(support[draft.id]):g.cards.some(c=>c.id===draft.id&&c.used);if(used){if(draft.id==='spy'&&draft.opponent)setSpy({player:draft.opponent,tokens:g.secrets[viewer].intel});setDraft(null);setMessage('');}},[g?.revision]);
 function submit(d:Draft){if(!g)return;setAttempted(true);send(support[d.id]?{type:d.id,order:d.orders[0]}:{type:'card',card:d.id,provinces:d.provinces,orders:d.orders,discard:d.discard,hand:d.hand,sacrifice:d.sacrifice,opponent:d.opponent,placement:d.placement});if(support[d.id])setDraft(null);}
 function update(d:Draft){setAttempted(false);setMessage('');setDraft(d);if(g&&cardStep(d,g,viewer)==='ready')submit(d);}
 const preview=(id:string)=>{if(!g)return;setAttempted(false);setSpy(null);setMessage('');setDraft({id,started:false,provinces:[],orders:[],discard:[],hand:[],revision:g.revision});};
 const cancel=()=>{setDraft(null);setMessage('');};
 function province(id:string,from?:string){if(!draft||!g||!playing)return false;const p=g.round.provinces[id];if(step==='sacrifice'){if(p.owner!==viewer||p.shadowlands){setMessage('Нажмите свою провинцию вне Земель Тени.');return true;}update({...draft,sacrifice:id});return true;}
  if(step==='province'){const error=cardProvinceError(draft,g,viewer,id);if(error){setMessage(error);return true;}update({...draft,provinces:[...draft.provinces,id]});return true;}
  if(step==='placement'){update({...draft,placement:{token:draft.discard[0],target:id,...(from?{from}:{})}});return true;}return false;
 }
 function order(id:string){if(!draft||!g||!playing)return false;const o=g.round.orders.find(o=>o.id===id);if(!o)return true;
  if(step==='province'||step==='sacrifice')return province(o.target);
  if(step==='placement'){update({...draft,placement:{token:draft.discard[0],target:o.target,from:o.from,parent:id}});return true;}
  if(step==='order'){if(o.parent||g.round.orders.some(x=>x.parent===id)||(['scout','shugenja'].includes(draft.id)&&o.player===viewer)){setMessage('Выберите подходящий приказ без благословения.');return true;}if(draft.orders.includes(id)){setMessage('Этот приказ уже выбран.');return true;}update({...draft,orders:[...draft.orders,id]});return true;}return false;
 }
 function player(id:string){if(!draft||!playing||step!=='player')return;if(id===viewer){setMessage('Выберите соперника.');return;}update({...draft,opponent:id});}
 function token(id:string){if(!draft||!playing)return false;if(step==='hand'){update({...draft,hand:[id]});return true;}if(step==='discard'){if(draft.discard.includes(id))return true;update({...draft,discard:[...draft.discard,id]});return true;}return false;}
 const hint=step==='sacrifice'?'Нажмите свою провинцию: пожертвовать одним контролем.':step==='player'?'Нажмите соперника в списке игроков справа.':step==='order'?`Нажмите приказ на поле${draft?.orders.length?` · выбрано ${draft.orders.length}`:''}.`:step==='discard'?'Выберите жетон в своём сбросе (левая колонка, «Сброс»).':step==='hand'?'Нажмите жетон в своей руке.':step==='placement'?'Укажите место возвращённого жетона на карте.':step==='province'?draft?.id==='exchange'?(draft.provinces.length?'Теперь нажмите провинцию соперника.':'Сначала нажмите свою провинцию.'):draft?.provinces.length&&['pirates','peace'].includes(draft.id)?'Нажмите свою провинцию для бонуса контроля.':`Нажмите провинцию на поле${draft?.provinces.length?` · выбрано ${draft.provinces.length}`:''}.`:'Цели выбраны.';
 const panel=draft?<section className="card-inspector" aria-label="Выбранная карта"><header><b>{card?.name??support[draft.id]}</b><button onClick={cancel} aria-label={playing?'Отменить розыгрыш карты':'Закрыть выбранную карту'}>✕</button></header>{!playing?<><p>{card?.description??(draft.id==='scout'?'Тайно посмотрите чужой приказ. Благословение защищает от разведки.':draft.id==='shugenja'?'Откройте и сбросьте чужой приказ без благословения.':'Посмотрите приказ и верните его в резерв владельца.')}</p><button className="primary" onClick={()=>{const next={...draft,started:true};update(next);}}>Использовать</button></>:<><p role="status">{hint}</p>{step==='ready'&&g?.errors[viewer]&&<button onClick={()=>update({...draft,provinces:[],orders:[],discard:[],hand:[],sacrifice:undefined,opponent:undefined,placement:undefined,revision:g.revision})}>Выбрать цели заново</button>}{(message||attempted&&g?.errors[viewer])&&<p role="alert">{message||g?.errors[viewer]}</p>}{(draft.id==='dark'&&draft.orders.length>0||draft.id==='fear'&&!!draft.sacrifice||step==='ready')&&<button onClick={()=>submit(draft)}>Завершить выбор</button>}</>}</section>:null;
 const spyPanel=spy?<section className="spy-view"><header><b>Рука: {g?.round.players[spy.player].name}</b><button onClick={()=>setSpy(null)}>Закрыть</button></header><div className="hand">{spy.tokens.map(t=><TokenArt key={t.id} token={t} clan={g?.round.players[spy.player].clan}/>)}</div></section>:null;
 return{draft,step,playing,preview,cancel,province,order,player,token,panel,spyPanel};
}
