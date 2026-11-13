import {useEffect,useRef,type ReactNode} from 'react';
import {CLANS,type Clan,type Special,type Token} from '@rokugan/engine';
import {Emblem,TokenArt,clanColors} from './Art';
import {SpecialToken,specialText} from './ArtBoard';

/**
 * Ширма клана. Скан ширмы в наборе всего 500×176 пикселей — текст на нём не прочесть,
 * поэтому её содержимое свёрстано заново: способность, уникальный жетон и памятка по жетонам.
 */
export const TOKEN_GUIDE:{kind:Token['kind'];name:string;text:string}[]=[
 {kind:'army',name:'Армия',text:'Атака через сухопутную границу из своей провинции или защита своей провинции (в центре).'},
 {kind:'navy',name:'Флот',text:'Атака прибрежной провинции с моря или защита своей прибрежной провинции.'},
 {kind:'shinobi',name:'Синоби',text:'Атака любой провинции: кладётся в её центр, соседство не нужно.'},
 {kind:'blessing',name:'Благословение',text:'Кладётся на свой приказ: +2 к его силе, приказ нельзя разведать и снять картами.'},
 {kind:'raid',name:'Набег',text:'В центр чужой соседней провинции: выжигает её — провинция навсегда без владельца, приказы в ней сняты.'},
 {kind:'diplomacy',name:'Дипломатия',text:'В центр своей провинции: мир — её нельзя атаковать, и из неё нельзя атаковать.'},
 {kind:'bluff',name:'Блеф',text:'Кладётся как любой приказ и снимается при раскрытии. Всегда возвращается за ширму — он есть в руке каждый раунд.'},
];
export const SPECIAL_GUIDE:{special:Special;text:string}[]=[
 {special:{kind:'peace'},text:'Мир: провинцию нельзя атаковать, её владелец не атакует из неё. Сюда нельзя класть приказы.'},
 {special:{kind:'scorched'},text:'Выжженная земля: провинция без владельца до конца игры, не даёт чести, приказы класть нельзя.'},
 {special:{kind:'honor',value:2},text:'Бонус чести (+1, +2, +4 «Бусидо»): владелец провинции получает больше чести в конце игры.'},
 {special:{kind:'defense',value:2},text:'Бонус защиты: + к защите владельца и +1 честь.'},
 {special:{kind:'shrine'},text:'Святилище: провинцию нельзя атаковать.'},
 {special:{kind:'battlefield'},text:'Поле битвы: здесь нельзя применять набег и дипломатию.'},
 {special:{kind:'harbor'},text:'Порт: внутренняя провинция считается прибрежной.'},
];
const uniqueToken=(clan:string,owner:string):Token=>{const [kind,strength]=CLANS[clan as Clan].unique;return {id:`unique-${clan}`,kind,strength,owner} as Token;};
const kindName:Record<string,string>={army:'Армия',navy:'Флот',shinobi:'Синоби',blessing:'Благословение',raid:'Набег',diplomacy:'Дипломатия',bluff:'Блеф'};

/** Кратко о клане: герб, способность и уникальный жетон — для ширмы и подсказки у игрока. */
export function ClanBrief({clan,owner='',children}:{clan:string;owner?:string;children?:ReactNode}){
 const c=CLANS[clan as Clan],t=uniqueToken(clan,owner);
 return <div className="clan-brief" style={{['--clan' as string]:clanColors[clan]}}>
  <header><Emblem clan={clan}/><div><span className="eyebrow">Клан</span><b>{c.name}</b></div></header>
  <p className="clan-ability-text">{c.ability}</p>
  <div className="unique-token"><TokenArt clan={clan} token={t}/><span><small>Уникальный боевой жетон</small><b>{kindName[t.kind]}{t.strength?' '+t.strength:''}</b></span></div>
  {children}
 </div>;
}

/** Полная ширма: открывается кнопкой «Ширма», текст крупный и читаемый. */
export function ScreenDialog({clan,onClose,children}:{clan:string;onClose:()=>void;children?:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="screen-dialog" aria-label={`Ширма клана ${CLANS[clan as Clan].name}`} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <button className="dialog-close" autoFocus onClick={onClose} aria-label="Закрыть ширму">✕</button>
  <div className="screen-grid">
   <section><ClanBrief clan={clan}>{children}</ClanBrief></section>
   <section><h3>Боевые жетоны</h3><TokenGuide clan={clan}/></section>
   <section><h3>Особые жетоны на поле</h3><SpecialGuide/></section>
  </div>
 </dialog>;
}
export function TokenGuide({clan}:{clan?:string}){
 return <ul className="token-guide">{TOKEN_GUIDE.map(g=><li key={g.kind}><TokenArt clan={clan} token={{id:g.kind,kind:g.kind,strength:g.kind==='army'?2:g.kind==='navy'||g.kind==='shinobi'?1:g.kind==='blessing'?2:0}}/><span><b>{g.name}</b>{g.text}</span></li>)}</ul>;
}
export function SpecialGuide(){
 return <ul className="token-guide specials">{SPECIAL_GUIDE.map(g=><li key={g.special.kind}><svg viewBox="-16 -16 32 32" className="token-art" aria-hidden="true"><SpecialToken special={g.special} size={30}/></svg><span><b>{specialText(g.special)}</b>{g.text.replace(/^[^:]+: /,'')}</span></li>)}</ul>;
}
/** Способности всех кланов — сноска в правилах. */
export function ClanTable(){
 return <div className="clan-table">{(Object.keys(CLANS) as Clan[]).map(id=><ClanBrief key={id} clan={id}/>)}</div>;
}
