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

let selectedMode = 'amrap', soundOn = true, audioContext, recordingUrl;
let run = { segments:[], index:0, running:false, startedAt:0, remaining:0, elapsed:0, raf:0, config:null };
let capture = { stream:null, recorder:null, chunks:[], destination:null, mic:null, recording:false };
const el = {
  setup:$('#setupView'), timer:$('#timerView'), fields:$('#dynamicFields'), clock:$('#clock'), state:$('#timerState'),
  exercise:$('#exerciseLabel'), next:$('#nextLabel'), round:$('#roundLabel'), mode:$('#modeLabel'), pause:$('#pauseButton'),
  preview:$('#cameraPreview'), record:$('#recordButton'), badge:$('#recordingBadge'), download:$('#downloadRecording')
};

function field(name,label,value) { return `<label>${label}<input id="${name}" type="number" min="0" max="7200" value="${value}" required /></label>`; }
function renderFields() { el.fields.innerHTML = modes[selectedMode].fields.map(([n,l,v])=>field(n,l,v)).join(''); }
function val(id, fallback=0) { return Math.max(0, Number.parseInt($('#'+id)?.value,10) || fallback); }
function configFromForm() {
  const c = {
    mode:selectedMode, name:$('#wodName').value.trim() || 'TODAY\'S WOD', prep:val('prepSeconds'), beeps:$('#countdownBeeps').checked,
    cueProfile:$('#cueProfile').value, voice:$('#voiceCues').checked, capture:$('#captureMode').checked, facing:$('#cameraFacing').value
  };
  for(const [n,,v] of modes[selectedMode].fields) c[n]=val(n,v);
  return c;
}
function segment(type, seconds, label, round=0, total=0, extra='') { return {type,seconds,label,round,total,extra}; }
function program(c) {
  const a=[]; if(c.prep) a.push(segment('ready',c.prep,'GET READY'));
  const loops=(work,rest,rounds) => { for(let i=1;i<=rounds;i++){ a.push(segment('work',work,'WORK',i,rounds)); if(rest&&i<rounds) a.push(segment('rest',rest,'REST',i,rounds)); } };
  if(c.mode==='stopwatch') a.push(segment('countup',0,'STOPWATCH'));
  else if(c.mode==='fortime' && !c.limit) a.push(segment('countup',0,'FOR TIME'));
  else if(['amrap','countdown','fortime'].includes(c.mode)) a.push(segment('work',c.limit,'WORK'));
  else if(c.mode==='emom') loops(c.roundLength,0,c.rounds);
  else if(['tabata','interval'].includes(c.mode)) loops(c.work,c.rest,c.rounds);
  else if(c.mode==='fgb') { for(let r=1;r<=c.rounds;r++){ for(let s=1;s<=c.stations;s++) a.push(segment('work',c.stationTime,`STATION ${s}`,r,c.rounds)); if(r<c.rounds)a.push(segment('rest',c.rest,'ROUND REST',r,c.rounds)); } }
  else if(c.mode==='deathby') for(let i=1;i<=c.rounds;i++) a.push(segment('work',c.roundLength,`DO ${c.startReps+i-1} REPS`,i,c.rounds));
  return a;
}
function format(sec) { sec=Math.max(0,Math.ceil(sec)); return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
function ensureAudio() {
  if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if(audioContext.state === 'suspended') audioContext.resume();
  if(capture.stream && !capture.destination) {
    capture.destination = audioContext.createMediaStreamDestination();
    try { capture.mic = audioContext.createMediaStreamSource(capture.stream); capture.mic.connect(capture.destination); } catch {}
  }
}
function beep(freq=880, duration=.09) {
  if(!soundOn) return;
  try {
    ensureAudio();
    const o=audioContext.createOscillator(), g=audioContext.createGain();
    o.frequency.value=freq; g.gain.value=.11; o.connect(g); g.connect(audioContext.destination);
    if(capture.destination) g.connect(capture.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration); o.stop(audioContext.currentTime+duration);
  } catch {}
}
function say(text) {
  if(!run.config?.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(text); utterance.lang='ko-KR'; utterance.rate=1.08; speechSynthesis.speak(utterance);
}
function announceSegment(s) {
  const spoken = s.type==='ready' ? '준비' : s.type==='rest' ? '휴식' : s.type==='work' ? '운동 시작' : s.label;
  beep(s.type==='ready' ? 620 : s.type==='rest' ? 620 : 930, s.type==='ready' ? .12 : .18); say(spoken);
}
function current() { return run.segments[run.index]; }
function display() {
  const s=current(); if(!s) return;
  const left=s.type==='countup' ? run.elapsed : run.remaining;
  el.clock.textContent=format(left); el.state.textContent=run.running ? s.label : 'PAUSED'; el.exercise.textContent=s.extra || run.config.name;
  el.round.textContent=s.round ? `ROUND ${s.round} / ${s.total}` : 'ROUND —'; el.mode.textContent=modes[run.config.mode].label;
  const n=run.segments[run.index+1]; el.next.textContent=n ? `NEXT: ${n.label}${n.round ? ` · ROUND ${n.round}` : ''}` : 'NEXT: FINISH';
  el.timer.dataset.state=run.running ? s.type : 'paused';
}
function shouldCountdownCue(second) { const p=run.config.cueProfile; return p==='intense' ? second<=10 : p==='standard' ? second<=3 : false; }
function tick(now) {
  if(!run.running) return;
  const s=current(), delta=(now-run.startedAt)/1000;
  if(s.type==='countup') { run.elapsed+=delta; run.startedAt=now; }
  else {
    const old=Math.ceil(run.remaining); run.remaining-=delta; run.startedAt=now; const second=Math.ceil(run.remaining);
    if(run.config.beeps && run.remaining>0 && second!==old && shouldCountdownCue(second)) { beep(700,.07); if(run.config.voice && run.config.cueProfile==='intense' && second<=3) say(String(second)); }
    if(run.remaining<=0) { beep(1050,.22); next(); return; }
  }
  display(); run.raf=requestAnimationFrame(tick);
}
function startSegment(index=0) {
  cancelAnimationFrame(run.raf); run.index=index; const s=current(); if(!s) { finish(); return; }
  run.remaining=s.seconds; run.elapsed=0; run.startedAt=performance.now(); run.running=true; announceSegment(s); display(); run.raf=requestAnimationFrame(tick);
}
function next() { startSegment(run.index+1); }
function previous() { startSegment(Math.max(0,run.index-1)); }
function pause() {
  if(run.running) { run.running=false; cancelAnimationFrame(run.raf); el.pause.innerHTML='RESUME <kbd>Space</kbd>'; display(); }
  else { run.running=true; run.startedAt=performance.now(); el.pause.innerHTML='PAUSE <kbd>Space</kbd>'; display(); run.raf=requestAnimationFrame(tick); }
}
function finish() { run.running=false; el.timer.dataset.state='finished'; el.state.textContent='FINISHED'; el.next.textContent='TIMER COMPLETE'; el.pause.disabled=true; beep(1100,.45); say('운동 종료'); if(capture.recording) stopRecording(); }
function launch(c) { run.config=c; run.segments=program(c); el.setup.classList.add('hidden'); el.timer.classList.remove('hidden'); el.pause.disabled=false; el.pause.innerHTML='PAUSE <kbd>Space</kbd>'; startSegment(); }
function reset() { startSegment(0); }

async function enableCamera(c) {
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 카메라 촬영을 지원하지 않습니다.');
  capture.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ideal:c.facing}, width:{ideal:1920}, height:{ideal:1080} }, audio:true });
  el.preview.srcObject=capture.stream; await el.preview.play(); el.timer.classList.add('capturing'); ensureAudio(); startRecording();
}
function preferredMime() { return ['video/mp4;codecs=avc1,mp4a','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x => MediaRecorder.isTypeSupported?.(x)) || ''; }
function startRecording() {
  if(!capture.stream || !window.MediaRecorder) return;
  const stream = capture.destination ? new MediaStream([...capture.stream.getVideoTracks(), ...capture.destination.stream.getAudioTracks()]) : capture.stream;
  capture.chunks=[]; const mimeType=preferredMime();
  try { capture.recorder=new MediaRecorder(stream, mimeType ? {mimeType} : undefined); } catch { capture.recorder=new MediaRecorder(capture.stream); }
  capture.recorder.ondataavailable=e=>{ if(e.data.size) capture.chunks.push(e.data); };
  capture.recorder.onstop=()=>{
    const type=capture.recorder.mimeType || 'video/webm'; const blob=new Blob(capture.chunks,{type});
    if(recordingUrl) URL.revokeObjectURL(recordingUrl); recordingUrl=URL.createObjectURL(blob); el.download.href=recordingUrl; el.download.download=`box-wod-${new Date().toISOString().replace(/[:.]/g,'-')}.${type.includes('mp4')?'mp4':'webm'}`; el.download.hidden=false;
  };
  capture.recorder.start(1000); capture.recording=true; el.badge.hidden=false; el.record.hidden=false; el.record.textContent='STOP REC';
}
function stopRecording() {
  if(capture.recorder?.state==='recording') capture.recorder.stop(); capture.recording=false; el.badge.hidden=true; el.record.hidden=true;
}
function stopCamera() {
  if(capture.recording) stopRecording(); capture.stream?.getTracks().forEach(t=>t.stop()); capture={stream:null,recorder:null,chunks:[],destination:null,mic:null,recording:false}; el.preview.srcObject=null; el.timer.classList.remove('capturing');
}
function exit() { cancelAnimationFrame(run.raf); run.running=false; window.speechSynthesis?.cancel(); stopCamera(); el.timer.classList.add('hidden'); el.setup.classList.remove('hidden'); if(document.fullscreenElement) document.exitFullscreen(); }
async function begin(c) {
  el.download.hidden=true; if(recordingUrl){URL.revokeObjectURL(recordingUrl);recordingUrl=null;}
  try { ensureAudio(); if(c.capture) await enableCamera(c); launch(c); }
  catch(err) { stopCamera(); alert(`촬영 모드를 시작하지 못했습니다.\n${err.message}\n카메라·마이크 권한을 허용한 뒤 다시 시도하세요.`); }
}
function presets() { return JSON.parse(localStorage.getItem('box-wod-presets')||'[]'); }
function renderPresets() { const p=presets(), area=$('#presetsSection'), list=$('#presetList'); area.hidden=!p.length; list.innerHTML=p.map((x,i)=>`<div class="preset"><button data-load="${i}">${x.name} · ${modes[x.mode].label}</button><button class="delete" data-delete="${i}" aria-label="삭제">×</button></div>`).join(''); }

$('#modeGrid').addEventListener('click',e=>{ const b=e.target.closest('[data-mode]'); if(!b)return; selectedMode=b.dataset.mode; $$('.mode-card').forEach(x=>x.classList.toggle('active',x===b)); renderFields(); });
$('#captureMode').addEventListener('change',e=>$('#cameraFacingLabel').hidden=!e.target.checked);
$('#timerForm').addEventListener('submit',async e=>{ e.preventDefault(); await begin(configFromForm()); });
$('#savePreset').addEventListener('click',()=>{ const p=presets(); p.push(configFromForm()); localStorage.setItem('box-wod-presets',JSON.stringify(p)); renderPresets(); });
$('#presetList').addEventListener('click',async e=>{ const i=e.target.dataset.load, d=e.target.dataset.delete; if(d!==undefined){const p=presets();p.splice(d,1);localStorage.setItem('box-wod-presets',JSON.stringify(p));renderPresets();} if(i!==undefined) await begin(presets()[i]); });
$('#soundButton').addEventListener('click',e=>{ soundOn=!soundOn; e.currentTarget.textContent=soundOn?'🔊 SOUND ON':'🔇 SOUND OFF'; e.currentTarget.setAttribute('aria-pressed',soundOn); });
$('#themeButton').addEventListener('click',()=>document.body.classList.toggle('light'));
el.pause.addEventListener('click',pause); $('#nextButton').addEventListener('click',next); $('#backButton').addEventListener('click',previous); $('#resetButton').addEventListener('click',reset); $('#exitButton').addEventListener('click',exit); $('#fullscreenButton').addEventListener('click',()=>document.documentElement.requestFullscreen?.()); el.record.addEventListener('click',stopRecording);
document.addEventListener('keydown',e=>{ if(el.timer.classList.contains('hidden'))return; if(e.code==='Space'){e.preventDefault();pause();} if(e.key.toLowerCase()==='n')next(); if(e.key.toLowerCase()==='b')previous(); if(e.key.toLowerCase()==='r')reset(); if(e.key.toLowerCase()==='f')document.documentElement.requestFullscreen?.(); if(e.key==='Escape')exit(); });
renderFields(); renderPresets();
