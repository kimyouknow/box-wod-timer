const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const modes = {
  amrap: { label:'AMRAP', fields:[['limit','제한 시간 (초)',1200],['rounds','목표 라운드 (선택)',0]] },
  emom: { label:'EMOM', fields:[['roundLength','라운드 길이 (초)',60],['rounds','총 라운드',10]] },
  tabata: { label:'TABATA', fields:[['work','운동 시간 (초)',20],['rest','휴식 시간 (초)',10],['rounds','세트 수',8]] },
  interval: { label:'INTERVAL', fields:[['work','운동 시간 (초)',60],['rest','휴식 시간 (초)',30],['rounds','총 라운드',5]] },
  countdown: { label:'COUNTDOWN', fields:[['limit','제한 시간 (초)',300]] },
  stopwatch: { label:'STOPWATCH', fields:[] },
  fortime: { label:'FOR TIME', fields:[['limit','제한 시간 (초, 0=무제한)',0]] },
  fgb: { label:'FIGHT GONE BAD', fields:[['stations','스테이션 수',5],['stationTime','스테이션 시간 (초)',60],['rounds','총 라운드',3],['rest','라운드 휴식 (초)',60]] },
  deathby: { label:'DEATH BY', fields:[['roundLength','라운드 길이 (초)',60],['rounds','최대 라운드',20],['startReps','시작 반복 수',1]] }
};
let selectedMode = 'amrap', soundOn = true;
let run = { segments:[], index:0, running:false, startedAt:0, remaining:0, elapsed:0, raf:0, config:null };
const el = { setup:$('#setupView'), timer:$('#timerView'), fields:$('#dynamicFields'), clock:$('#clock'), state:$('#timerState'), exercise:$('#exerciseLabel'), next:$('#nextLabel'), round:$('#roundLabel'), mode:$('#modeLabel'), pause:$('#pauseButton') };

function field(name,label,value) { return `<label>${label}<input id="${name}" type="number" min="0" max="7200" value="${value}" required /></label>`; }
function renderFields() { el.fields.innerHTML = modes[selectedMode].fields.map(([n,l,v])=>field(n,l,v)).join(''); }
function val(id, fallback=0) { return Math.max(0, Number.parseInt($('#'+id)?.value,10) || fallback); }
function configFromForm() { const c = { mode:selectedMode, name:$('#wodName').value.trim() || 'TODAY\'S WOD', prep:val('prepSeconds'), beeps:$('#countdownBeeps').checked }; for(const [n,,v] of modes[selectedMode].fields) c[n]=val(n,v); return c; }
function segment(type, seconds, label, round=0, total=0, extra='') { return {type,seconds,label,round,total,extra}; }
function program(c) {
  const a=[]; if(c.prep) a.push(segment('ready',c.prep,'GET READY'));
  const loops=(work,rest,rounds) => { for(let i=1;i<=rounds;i++){a.push(segment('work',work,'WORK',i,rounds));if(rest&&i<rounds)a.push(segment('rest',rest,'REST',i,rounds));} };
  if(c.mode==='stopwatch') a.push(segment('countup',0,'STOPWATCH'));
  else if(c.mode==='fortime' && !c.limit) a.push(segment('countup',0,'FOR TIME'));
  else if(['amrap','countdown','fortime'].includes(c.mode)) a.push(segment('work',c.limit,'WORK'));
  else if(c.mode==='emom') loops(c.roundLength,0,c.rounds);
  else if(['tabata','interval'].includes(c.mode)) loops(c.work,c.rest,c.rounds);
  else if(c.mode==='fgb') { for(let r=1;r<=c.rounds;r++){for(let s=1;s<=c.stations;s++)a.push(segment('work',c.stationTime,`STATION ${s}`,r,c.rounds));if(r<c.rounds)a.push(segment('rest',c.rest,'ROUND REST',r,c.rounds));} }
  else if(c.mode==='deathby') for(let i=1;i<=c.rounds;i++) a.push(segment('work',c.roundLength,`DO ${c.startReps+i-1} REPS`,i,c.rounds));
  return a;
}
function format(sec) { sec=Math.max(0,Math.ceil(sec)); return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
function beep(freq=880,duration=.09) { if(!soundOn) return; try { const ctx=new AudioContext(), o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=freq; g.gain.value=.08; o.connect(g).connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration); o.stop(ctx.currentTime+duration); } catch {} }
function current() { return run.segments[run.index]; }
function display() { const s=current(); if(!s)return; const left=s.type==='countup' ? run.elapsed : run.remaining; el.clock.textContent=format(left); el.state.textContent=run.running ? s.label : 'PAUSED'; el.exercise.textContent=s.extra || run.config.name; el.round.textContent=s.round ? `ROUND ${s.round} / ${s.total}` : 'ROUND —'; el.mode.textContent=modes[run.config.mode].label; const n=run.segments[run.index+1]; el.next.textContent=n ? `NEXT: ${n.label}${n.round ? ` · ROUND ${n.round}` : ''}` : 'NEXT: FINISH'; el.timer.dataset.state=run.running ? s.type : 'paused'; }
function tick(now) { if(!run.running) return; const s=current(); const delta=(now-run.startedAt)/1000; if(s.type==='countup') { run.elapsed+=delta; run.startedAt=now; } else { run.remaining-=delta; run.startedAt=now; if(run.config.beeps && run.remaining>0 && run.remaining<=3 && Math.ceil(run.remaining)!==Math.ceil(run.remaining+delta)) beep(700); if(run.remaining<=0) { beep(1050,.2); next(); return; } } display(); run.raf=requestAnimationFrame(tick); }
function startSegment(index=0) { cancelAnimationFrame(run.raf); run.index=index; const s=current(); if(!s){ finish();return; } run.remaining=s.seconds; run.elapsed=0; run.startedAt=performance.now(); run.running=true; beep(s.type==='ready'?620:900); display(); run.raf=requestAnimationFrame(tick); }
function next() { startSegment(run.index+1); }
function previous() { startSegment(Math.max(0,run.index-1)); }
function pause() { if(run.running) { run.running=false; cancelAnimationFrame(run.raf); el.pause.innerHTML='RESUME <kbd>Space</kbd>'; display(); } else { run.running=true; run.startedAt=performance.now(); el.pause.innerHTML='PAUSE <kbd>Space</kbd>'; display(); run.raf=requestAnimationFrame(tick); } }
function finish() { run.running=false; el.timer.dataset.state='finished'; el.state.textContent='FINISHED'; el.next.textContent='TIMER COMPLETE'; el.pause.disabled=true; beep(1100,.45); }
function launch(c) { run.config=c; run.segments=program(c); el.setup.classList.add('hidden'); el.timer.classList.remove('hidden'); el.pause.disabled=false; el.pause.innerHTML='PAUSE <kbd>Space</kbd>'; startSegment(); }
function reset() { startSegment(0); }
function exit() { cancelAnimationFrame(run.raf); run.running=false; el.timer.classList.add('hidden'); el.setup.classList.remove('hidden'); if(document.fullscreenElement) document.exitFullscreen(); }
function presets() { return JSON.parse(localStorage.getItem('box-wod-presets')||'[]'); }
function renderPresets() { const p=presets(), area=$('#presetsSection'), list=$('#presetList'); area.hidden=!p.length; list.innerHTML=p.map((x,i)=>`<div class="preset"><button data-load="${i}">${x.name} · ${modes[x.mode].label}</button><button class="delete" data-delete="${i}" aria-label="삭제">×</button></div>`).join(''); }

$('#modeGrid').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b)return; selectedMode=b.dataset.mode;$$('.mode-card').forEach(x=>x.classList.toggle('active',x===b));renderFields();});
$('#timerForm').addEventListener('submit',e=>{e.preventDefault();launch(configFromForm());});
$('#savePreset').addEventListener('click',()=>{const p=presets();p.push(configFromForm());localStorage.setItem('box-wod-presets',JSON.stringify(p));renderPresets();});
$('#presetList').addEventListener('click',e=>{const i=e.target.dataset.load, d=e.target.dataset.delete;if(d!==undefined){const p=presets();p.splice(d,1);localStorage.setItem('box-wod-presets',JSON.stringify(p));renderPresets();}if(i!==undefined)launch(presets()[i]);});
$('#soundButton').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.textContent=soundOn?'🔊 SOUND ON':'🔇 SOUND OFF';e.currentTarget.setAttribute('aria-pressed',soundOn);});
$('#themeButton').addEventListener('click',()=>document.body.classList.toggle('light'));
el.pause.addEventListener('click',pause);$('#nextButton').addEventListener('click',next);$('#backButton').addEventListener('click',previous);$('#resetButton').addEventListener('click',reset);$('#exitButton').addEventListener('click',exit);$('#fullscreenButton').addEventListener('click',()=>document.documentElement.requestFullscreen?.());
document.addEventListener('keydown',e=>{if(el.timer.classList.contains('hidden'))return;if(e.code==='Space'){e.preventDefault();pause();}if(e.key.toLowerCase()==='n')next();if(e.key.toLowerCase()==='b')previous();if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='f')document.documentElement.requestFullscreen?.();if(e.key==='Escape')exit();});
renderFields();renderPresets();
