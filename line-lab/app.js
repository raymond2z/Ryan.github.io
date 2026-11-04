import {Simulation,DT,weights,nearest,clamp,trackNames,defaults,experiments,MODEL_VERSION,MOTOR_MAX} from './engine.js?v=5'
import {drawFadingTrail} from './trail.js?v=5';
import {initEvolution} from './evolution.js?v=5';
const $=id=>document.getElementById(id);
let sim=new Simulation(),running=false,zoom=1,playback=1,accumulator=0,lastFrame=0,mixed=false,pushes=0,currentLesson='rules',duration=0,toastTimer;
let results=[];try{const x=JSON.parse(localStorage.getItem('lineLabTests')||'[]');if(Array.isArray(x))results=x.filter(r=>r&&typeof r.mode==='string'&&typeof r.track==='string').slice(-12);}catch{}
const canvas=$('arena'),ctx=canvas.getContext('2d'),chart=$('chart'),gx=chart.getContext('2d');
const fmt=(n,d=2)=>(n>=0?'+':'−')+Math.abs(n).toFixed(d);
const descriptions={rules:['Start with simple rules.','If the line is left, turn left. If it is right, turn right. Otherwise, go straight.'],p:['Turn more when the error is bigger.','P uses the error now. Try changing P: too little reacts slowly; too much can cause wobble.'],pd:['Give your steering some damping.','PD adds the rate of error change. D can reduce wobble, but too much can cause a rough response.'],pid:['Use now, over time, and change.','PID adds all three terms. I can reduce a lasting error. More terms do not always mean a better run.']};
const lessons={rules:{text:'Will a stronger turn make the robot smoother, or make it zigzag? Keep the same track and speed.',hint:'Test 15, then 35 at speed 35%. Save each result after the same run time.',config:experiments.rules},damping:{text:'At race pace, can D stop the wobble? Run P, then switch to PD without changing the speed or P.',hint:'Use speed 75%, P = 18. Compare P alone with PD at D = 6. Test each for 20 seconds.',config:experiments.damping},integral:{text:'One motor is weaker. Will adding a little I reduce the lasting error? Compare PD with PID.',hint:'Keep speed 55% and motor weakness 20%. Compare PD with PID at I = 3.',config:experiments.integral}};
for(let j=0;j<5;j++){
 const d=document.createElement('div');d.className='sensor';d.innerHTML=`<span>S${j+1}</span><div class="sensor-light"></div><b>0%</b><small>${weights[j]>0?'+':''}${weights[j]}</small>`;$('sensorArray').append(d);
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3400);}
function setRunning(value){running=value&&!sim.finished;$('play').innerHTML=running?'<span aria-hidden="true">Ⅱ</span> Pause robot':'<span aria-hidden="true">▶</span> '+(sim.time?'Resume robot':'Start robot');$('step').disabled=running;accumulator=0;update();}
function resetRun(message){running=false;sim.reset();mixed=false;pushes=0;accumulator=0;setRunning(false);if(message)toast(message);}
function syncControls(){
 const cfg=sim.config;for(const k of ['base','turn','deadband','kp','ki','kd','bias']){$(k).value=cfg[k];$(k+'Out').textContent=k==='base'||k==='bias'?cfg[k]+'%':k==='deadband'?cfg[k].toFixed(2):['kp','ki','kd'].includes(k)?cfg[k].toFixed(2):cfg[k];}
 $('track').value=cfg.track;const [title,text]=descriptions[cfg.mode];$('modeTitle').textContent=title;$('modeText').textContent=text;
 document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===cfg.mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
 $('ruleControls').hidden=cfg.mode!=='rules';$('pidControls').hidden=cfg.mode==='rules';$('iRow').hidden=cfg.mode!=='pid';$('dRow').hidden=cfg.mode==='p';$('terms').hidden=cfg.mode==='rules';
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(sim.config.mode===b.dataset.mode)return;sim.config.mode=b.dataset.mode;resetRun('New algorithm, fresh run. Your settings are kept.');syncControls();}));
for(const key of ['base','turn','deadband','kp','ki','kd','bias'])$(key).addEventListener('input',()=>{sim.config[key]=Number($(key).value);if(sim.time>0)mixed=true;syncControls();update();});
$('track').addEventListener('change',()=>{sim.config.track=$('track').value;resetRun('New track, fresh run.');});
$('play').addEventListener('click',()=>{if(sim.finished||(duration>0&&sim.time>=duration-0.001)){resetRun();setRunning(true);}else setRunning(!running);});
$('step').addEventListener('click',()=>{if(sim.finished||(duration>0&&sim.time>=duration-0.001)){toast('Reset the run to try again.');return;}sim.tick();update();});
$('reset').addEventListener('click',()=>resetRun('Run reset. Ready for another test.'));
$('fastDemo').addEventListener('click',()=>{sim.config={...defaults,...experiments.fast};duration=20;$('duration').value='20';playback=1;$('playback').value='1';resetRun('Fast PID demo: 80% speed. Compare it with P at the same speed.');syncControls();setRunning(true);});
$('playback').addEventListener('change',()=>{playback=Number($('playback').value);accumulator=0;});
$('duration').addEventListener('change',()=>{duration=Number($('duration').value);if(running&&duration>0&&sim.time>=duration)setRunning(false);});
$('nudge').addEventListener('click',()=>{sim.nudge(1);pushes++;update();toast('Pushed right. Watch the sensor error and recovery.');});
function setZoom(delta){zoom=clamp(Math.round((zoom+delta)*10)/10,1,3);$('zoomLabel').textContent=zoom+'×';$('zoomOut').disabled=zoom<=1;$('zoomIn').disabled=zoom>=3;draw();}
$('zoomIn').addEventListener('click',()=>setZoom(.5));$('zoomOut').addEventListener('click',()=>setZoom(-.5));
document.querySelectorAll('[data-lesson]').forEach(b=>b.addEventListener('click',()=>{currentLesson=b.dataset.lesson;document.querySelectorAll('[data-lesson]').forEach(x=>x.classList.toggle('active',x===b));$('lessonText').textContent=lessons[currentLesson].text;$('lessonHint').textContent=lessons[currentLesson].hint;}));
$('loadExperiment').addEventListener('click',()=>{sim.config={...defaults,...lessons[currentLesson].config};resetRun('Experiment ready. Make a prediction, then start.');syncControls();if(currentLesson==='integral')document.querySelector('.disturbance').open=true;$('workspace').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
const dialog=$('helpDialog');function openHelp(expand=false){dialog.showModal();if(expand)dialog.querySelector('details').open=true;}
$('help').addEventListener('click',()=>openHelp());$('modelNotes').addEventListener('click',()=>openHelp(true));$('closeHelp').addEventListener('click',()=>dialog.close());$('startLearning').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function persist(){try{localStorage.setItem('lineLabTests',JSON.stringify(results));}catch{toast('This browser cannot save tests. They will last until this page closes.');}}
$('saveResult').addEventListener('click',()=>{if(sim.time<1){toast('Run the robot for at least 1 second, then save.');return;}if(running)setRunning(false);results.push({version:MODEL_VERSION,track:sim.config.track,mode:sim.config.mode,settings:{...sim.config},t:sim.time,mean:sim.meanError,seen:sim.seenPercent,laps:sim.laps,mixed,pushes});if(results.length>12)results.shift();persist();renderResults();toast('Test saved. Reset the run before your next test.');});
$('clearResults').addEventListener('click',()=>{if(!results.length){toast('Your test bench is already clear.');return;}const old=[...results];results=[];persist();renderResults();toast('Tests cleared. Press Undo to restore them.');const undo=document.createElement('button');undo.textContent='Undo';undo.style.cssText='margin-left:12px;padding:3px 8px;font-size:11px';undo.onclick=()=>{results=old;persist();renderResults();toast('Tests restored.');};$('toast').append(undo);$('toast').style.pointerEvents='auto';setTimeout(()=>$('toast').style.pointerEvents='',3400);});
function renderResults(){const body=$('resultsBody');body.replaceChildren();if(!results.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.className='empty-results';td.textContent='Your experiments belong here. Run the robot, then save a result.';tr.append(td);body.append(tr);return;}results.forEach((r,i)=>{const s=r.settings||{};const setting=r.mode==='rules'?`Turn ${s.turn} · zone ${s.deadband}`:`P ${s.kp}${r.mode==='pid'?' · I '+s.ki:''}${r.mode!=='p'?' · D '+s.kd:''}`;const data=[`${i+1}. ${trackNames[r.track]||r.track}${r.version===MODEL_VERSION?'':' (earlier model)'}`,r.mode==='rules'?'If / else':r.mode.toUpperCase(),`${r.mixed?'Mixed · final: ':''}${setting} · speed ${s.base}% · weak ${s.bias}%${r.pushes?' · pushes '+r.pushes:''}`,Number(r.t).toFixed(2)+' s',Number(r.mean).toFixed(3),Number(r.seen).toFixed(1)+'%',String(r.laps)];const tr=document.createElement('tr');data.forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});body.append(tr);});}
function update(){
 $('play').innerHTML=running?'<span aria-hidden="true">Ⅱ</span> Pause robot':'<span aria-hidden="true">▶</span> '+(sim.finished?'Restart robot':duration>0&&sim.time>=duration-0.001?'Start new test':sim.time?'Resume robot':'Start robot');
 $('time').innerHTML=sim.time.toFixed(2)+'<small>s</small>';$('meanError').textContent=sim.total?(sim.seen?sim.meanError.toFixed(3):'—'):'—';$('lineSeen').textContent=sim.total?Math.round(sim.seenPercent)+'%':'—';$('laps').textContent=sim.laps;
 const status=$('status');status.className='status'+(!sim.visible||sim.finished?' lost':running?' running':'');status.innerHTML='<i></i>';status.append(document.createTextNode(sim.finished?'Paused · try a reset':!sim.visible?'Line lost · searching':running?'Robot is running':sim.time?'Paused · take a look':'Ready to explore'));
 $('canvasHint').textContent=sim.finished?'Line not recovered. Reset, slow down, or try a smaller gain.':zoom>1?'Close-up follows the robot. Zoom out to see the full track.':running?'Follow the blue sensors. Watch the wheels make a decision.':sim.time?'Paused: inspect the last decision, or take another step.':'Start a run, or step through one decision.';
 document.querySelectorAll('.sensor').forEach((el,j)=>{const v=sim.sensors[j].value;el.querySelector('b').textContent=Math.round(v*100)+'%';el.querySelector('.sensor-light').style.background=`rgb(${Math.round(228-v*177)},${Math.round(235-v*130)},${Math.round(244-v*12)})`;el.style.borderColor=v>.3?'#b9cdf6':'#e8edf2';});
 $('error').textContent=sim.error===null?'LOST':fmt(sim.error);$('errorSide').textContent=sim.error===null?'No sensor sees the line':Math.abs(sim.error)<.15?'Near the middle':sim.error>0?'Line is to the right':'Line is to the left';
 const readings=sim.sensors.map(s=>s.value*100),sum=readings.reduce((a,b)=>a+b,0),weighted=readings.reduce((a,b,j)=>a+b*weights[j],0);
 $('workedExample').textContent=sim.error===null?'No line is visible. Do not divide by zero or use a guessed error. Use the recovery rule instead.':readings.map((v,j)=>'('+weights[j]+' × '+v.toFixed(1)+')').join(' + ')+' = '+weighted.toFixed(1)+'; divide by total readings '+sum.toFixed(1)+' → '+fmt(sim.error);
 const code=$('liveCode');code.replaceChildren();
 if(sim.config.mode==='rules'){
  const zone=sim.config.deadband.toFixed(2);const rows=[`if error < −${zone}: turn left`,`else if error > +${zone}: turn right`,'else: go straight'];const selected=sim.error===null?-1:sim.error < -sim.config.deadband?0:sim.error>sim.config.deadband?1:2;
  rows.forEach((text,i)=>{const span=document.createElement('span');span.className=i===selected&&sim.time?'active-line':'code-line';span.textContent=text;code.append(span);});
 }else{
  for(const t of ['P = Kp × error',...(sim.config.mode==='pid'?['I = Ki × sum(error × 0.02 s)']:[]),...(sim.config.mode!=='p'?['D = Kd × filtered change / 0.02 s']:[]),'turn = '+(sim.config.mode==='pid'?'P + I + D':sim.config.mode==='pd'?'P + D':'P')]){const span=document.createElement('span');span.className=t.startsWith('turn')?'active-line':'code-line';span.textContent=t;code.append(span);}
 }
 $('decision').textContent=sim.reason;$('pValue').textContent=fmt(sim.p,1);$('iValue').textContent=fmt(sim.i,1);$('dValue').textContent=fmt(sim.d,1);
 for(const key of ['left','right']){$(key+'Wheel').textContent=Math.round(sim[key])+'%';$(key+'Bar').style.width=Math.abs(sim[key])/MOTOR_MAX*100+'%';$(key+'Bar').classList.toggle('reverse',sim[key]<0);}
 $('snapshotNote').innerHTML=sim.error===null?'No line reading → use a <strong>recovery rule</strong>: turn toward the last seen side. Pause after 5 seconds without the line.':sim.config.mode==='rules'?'Press <strong>Step once</strong> to read, decide, and move for one cycle. Readings show the decision just taken.':`Correction = <strong>${fmt(sim.raw,1)}</strong>${Math.abs(sim.raw-sim.correction)>.05?' → limited to <strong>'+fmt(sim.correction,1)+'</strong>':''}. Left = speed + correction; right = speed − correction. Each motor is limited to −50…100%. Readings show the decision just taken.`;
 chart.setAttribute('aria-label',`Error chart for the last 12 seconds. Current error ${sim.error===null?'unavailable: line lost':sim.error.toFixed(2)}. Mean absolute error ${sim.meanError.toFixed(3)}; line seen ${sim.seenPercent.toFixed(1)} percent.`);
 draw();drawChart();
}
function setupCanvas(el,c){const dpr=Math.min(window.devicePixelRatio||1,2),r=el.getBoundingClientRect();if(el.width!==Math.round(r.width*dpr)||el.height!==Math.round(r.height*dpr)){el.width=Math.round(r.width*dpr);el.height=Math.round(r.height*dpr);}c.setTransform(dpr,0,0,dpr,0,0);return {w:r.width,h:r.height};}
function rounded(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
function draw(){
 if($('drivePanel').hidden)return;
 const {w,h}=setupCanvas(canvas,ctx);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fcfcfa';ctx.fillRect(0,0,w,h);
 const scale=Math.min(w/960,h/580)*zoom;const cx=zoom===1?480:sim.car.x,cy=zoom===1?290:sim.car.y;
 ctx.save();ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.translate(-cx,-cy);
 ctx.fillStyle='#dfe4e4';for(let x=0;x<960;x+=20)for(let y=0;y<580;y+=20){ctx.beginPath();ctx.arc(x,y,.65,0,Math.PI*2);ctx.fill();}
 ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();sim.path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle='#e8ecea';ctx.lineWidth=42;ctx.stroke();ctx.strokeStyle='#fefefc';ctx.lineWidth=35;ctx.stroke();ctx.strokeStyle='#29333d';ctx.lineWidth=16;ctx.stroke();
 drawFadingTrail(ctx,sim);
 const a=sim.path[0],b=sim.path[1],theta=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.translate(a.x,a.y);ctx.rotate(theta);for(let i=0;i<2;i++)for(let j=0;j<4;j++){ctx.fillStyle=(i+j)%2?'#f8f9f5':'#9ca5a9';ctx.fillRect(i*4-4,j*4-8,4,4);}ctx.restore();
 if(zoom===1){ctx.textAlign='center';ctx.fillStyle='#b5bfbd';ctx.font='500 12px "Segoe UI",sans-serif';ctx.fillText('THE TEST TRACK',480,285);ctx.font='10px "Segoe UI",sans-serif';ctx.fillStyle='#b8c2bf';ctx.fillText(trackNames[sim.config.track]+'  /  '+(sim.config.mode==='rules'?'IF / ELSE':sim.config.mode.toUpperCase())+' CONTROL',480,305);}
 const c=sim.car;ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.angle);
 ctx.shadowColor='#1b395442';ctx.shadowBlur=12;ctx.shadowOffsetY=4;rounded(ctx,-19,-16,38,32,10,'#4e83dc');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 rounded(ctx,-13,-20,20,7,2,'#263741');rounded(ctx,-13,13,20,7,2,'#263741');
 rounded(ctx,-19,-14,38,28,9,'#7da8ed','#4781d7');rounded(ctx,-13,-10,24,20,5,'#e0edfe');
 ctx.beginPath();ctx.moveTo(2,-4);ctx.lineTo(9,0);ctx.lineTo(2,4);ctx.strokeStyle='#6d98db';ctx.lineWidth=1.5;ctx.stroke();
 ctx.strokeStyle='#7997b5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(22,0);ctx.stroke();
 rounded(ctx,18,-29,8,58,3,'#d5e3f3','#a6bed9');
 sim.sensors.forEach((s,i)=>{ctx.beginPath();ctx.arc(22,weights[i]*12,4.3,0,Math.PI*2);ctx.fillStyle=s.value>.15?'#3369e8':'#f2f6fc';ctx.fill();ctx.strokeStyle='#739bcd';ctx.lineWidth=1;ctx.stroke();});
 ctx.restore();ctx.restore();
}
function drawChart(){
 if($('drivePanel').hidden)return;
 const {w,h}=setupCanvas(chart,gx);gx.clearRect(0,0,w,h);const pad={l:29,r:9,t:17,b:25},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b;
 gx.font='8px "Segoe UI",sans-serif';gx.textAlign='right';gx.textBaseline='middle';
 for(const v of [-2,-1,0,1,2]){const y=pad.t+(2-v)/4*ih;gx.beginPath();gx.moveTo(pad.l,y);gx.lineTo(w-pad.r,y);gx.strokeStyle=v===0?'#cad6e6':'#edf0f5';gx.lineWidth=1;gx.setLineDash(v===0?[3,3]:[]);gx.stroke();gx.fillStyle='#a7b2bf';gx.fillText(v>0?'+'+v:String(v),pad.l-8,y);}gx.setLineDash([]);
 const end=Math.max(12,sim.time),start=end-12;gx.textAlign='center';gx.textBaseline='top';
 for(let j=0;j<=4;j++){const x=pad.l+j*iw/4;gx.fillStyle='#a7b2bf';gx.fillText((start+j*3).toFixed(0)+'s',x,h-17);}
 gx.beginPath();let connected=false;for(const p of sim.history){if(p.t<start)continue;if(p.e===null){connected=false;continue;}const x=pad.l+(p.t-start)/12*iw,y=pad.t+(2-p.e)/4*ih;if(connected)gx.lineTo(x,y);else gx.moveTo(x,y);connected=true;}gx.strokeStyle='#638de5';gx.lineWidth=1.6;gx.stroke();
 if(!sim.history.length){gx.textAlign='center';gx.fillStyle='#b3bdc9';gx.font='10px "Segoe UI",sans-serif';gx.fillText('Start a run to see your error trace',pad.l+iw/2,pad.t+ih*.3);}
}
function frame(timestamp){const elapsed=lastFrame?Math.min((timestamp-lastFrame)/1000,.25):0;lastFrame=timestamp;if(running){accumulator+=elapsed*playback;let steps=0;while(accumulator>=DT&&steps<40){sim.tick();accumulator-=DT;steps++;if(duration>0&&sim.time>=duration-0.001){setRunning(false);toast(duration+' second test complete. Save this run to compare.');break;}if(sim.finished){setRunning(false);toast('The robot could not recover. Reset and change one setting.');break;}}if(steps)update();}requestAnimationFrame(frame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){setRunning(false);toast('Paused while you were away. Resume when you are ready.');}});
window.addEventListener('resize',()=>{draw();drawChart();});
const evolutionUI=initEvolution({onApply:(genome,config)=>{sim.config={...defaults,track:config.track,base:config.base,bias:config.bias,...genome,mode:'pid'};resetRun();syncControls();switchPane('drive');toast('Evolved genes applied. Try a new track to test them.');}});
function switchPane(pane,writeHash=true){
 setRunning(false);document.querySelector('.skip').setAttribute('href',pane==='ga'?'#gaPanel':'#workspace');$('drivePanel').hidden=pane!=='drive';$('gaPanel').hidden=pane!=='ga';
 document.querySelectorAll('[data-pane]').forEach(b=>{const active=b.dataset.pane===pane;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 evolutionUI.setActive(pane==='ga');if(writeHash)history.replaceState(null,'',pane==='ga'?'#genetic-algorithm':'#drive');if(pane==='drive')update();
}
const labTabs=[...document.querySelectorAll('[data-pane]')];labTabs.forEach((b,index)=>{b.addEventListener('click',()=>switchPane(b.dataset.pane));b.addEventListener('keydown',event=>{let target;if(event.key==='ArrowRight'||event.key==='ArrowLeft')target=labTabs[(index+1)%2];if(event.key==='Home')target=labTabs[0];if(event.key==='End')target=labTabs[1];if(target){event.preventDefault();switchPane(target.dataset.pane);target.focus();}});});
window.addEventListener('hashchange',()=>switchPane(location.hash==='#genetic-algorithm'?'ga':'drive',false));
syncControls();renderResults();setZoom(0);update();switchPane(location.hash==='#genetic-algorithm'?'ga':'drive',false);requestAnimationFrame(frame);
// Read-only inspection is useful for classroom demonstrations and QA.
window.lineLab={get state(){return {running,mode:sim.config.mode,track:sim.config.track,time:sim.time,error:sim.error,seen:sim.seenPercent,laps:sim.laps,finished:sim.finished,config:{...sim.config},results:results.length,zoom,mixed};}};
