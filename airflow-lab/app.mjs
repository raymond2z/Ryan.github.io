import {FluidSimulation} from './simulation.mjs';
import {EXTRA_SHAPES,shapePreview} from './shapes.mjs';
const $=id=>document.getElementById(id);
// Mobile-first performance selection. The user can explicitly choose a detailed grid.
const qualityPreference=new URLSearchParams(location.search).get('quality');
const qualityOption=['fast','detail'].includes(qualityPreference)?qualityPreference:'auto';
const useFastGrid=qualityOption==='fast'||(qualityOption==='auto'&&(matchMedia('(pointer: coarse)').matches||innerWidth<700));
const sim=new FluidSimulation(useFastGrid?168:240,useFastGrid?72:104);
const enginePreference=new URLSearchParams(location.search).get('engine');
const engineChoice=['javascript','wasm'].includes(enginePreference)?enginePreference:'auto';
let wasmActive=false,wasmStarting=false,wasmWorker=null,workerRequest=0,workerInFlight=0;
let engineRevision=0,lastWorkerRequest=0,manualSteps=0;
let performanceWindow=performance.now(),paintedFrames=0,simulatedSteps=0;
const requestedWasm=engineChoice!=='javascript';
const canvas=$('tunnel'),ctx=canvas.getContext('2d',{alpha:false});
const field=document.createElement('canvas');field.width=sim.width;field.height=sim.height;
const fieldCtx=field.getContext('2d',{alpha:false});
const pixels=fieldCtx.createImageData(sim.width,sim.height);
const W=sim.width,H=sim.height,SX=canvas.width/W,SY=canvas.height/H;
const names={circle:'Circle',block:'Block',streamlined:'Streamlined',plate:'Flat plate',custom:'Custom drawing',none:'No shape',...Object.fromEntries(Object.entries(EXTRA_SHAPES).map(([key,value])=>[key,value.label]))};
const presetNames=['circle','block','streamlined','plate',...Object.keys(EXTRA_SHAPES),'none'];
const animationModes={slow:3,normal:7,fast:12,super_fast:24};
const viewNames={curl:'Swirls',speed:'Speed',density:'Density'};
const notes={circle:'Look for alternating swirls behind the circle. This disturbed region is called the <b>wake</b>.',block:'Watch the sharp corners. Does the flow reconnect smoothly behind the block, or leave a wide wake?',streamlined:'Follow the flow along the curved front and tapered tail. Compare its wake with the block at the same settings.',plate:'A thin plate can still interrupt the flow. What changes when you turn it at an angle?',custom:'Try one simple shape at a time. Keep a gap around it so the fluid has room to pass.',none:'With no obstacle, the flow should become nearly uniform. Add a shape to see how the flow changes.'};
for(const [key,value]of Object.entries(EXTRA_SHAPES))notes[key]=value.note;
document.querySelectorAll('[data-shape-preview]').forEach(el=>el.innerHTML=shapePreview(el.dataset.shapePreview));
let view='curl',tool='move',running=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let sensor=null,pointer=null,particles=[],captures=[],experiment='shapes',lastFrame=0,lastReadout=0,pendingSteps=0,toastTimer;
const particleCount=useFastGrid?190:460;
const maxTrailPoints=useFastGrid?16:22;
const paintInterval=useFastGrid?1000/30:0;
let lastPaint=0;

function makeParticle(startAnywhere=true) {
  let x=2,y=2;
  for(let attempt=0;attempt<20;attempt++) {
    x=startAnywhere?2+Math.random()*(W-4):2; y=4+Math.random()*(H-8);
    if(!sim.solid[Math.floor(x)+Math.floor(y)*W]) break;
  }
  return {x,y,trail:[]};
}
function resetParticles(){particles=Array.from({length:particleCount},()=>makeParticle());}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function paint() {
  paintedFrames++;
  const data=pixels.data;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
    const i=x+y*W,k=i*4;
    let r=11,g=24,b=38;
    if(sim.solid[i]) {r=sim.shape==='pikachu'?250:224;g=sim.shape==='pikachu'?209:235;b=sim.shape==='pikachu'?64:240;}
    else {
      let value=0,target;
      if(view==='curl') {
        value=(x>0&&x<W-1&&y>0&&y<H-1)?sim.curlAt(i)/.025:0;
        target=value>=0?[251,168,75]:[68,210,226];
        value=Math.min(1,Math.abs(value));
        value=Math.pow(value,.65);
      } else if(view==='speed') {
        value=Math.min(1,Math.hypot(sim.ux[i],sim.uy[i])/.4);
        if(value<.5){target=[26,135,169];value*=2;}
        else {r=26;g=135;b=169;target=[247,208,103];value=(value-.5)*2;}
      } else {
        value=(sim.rho[i]-1)/.20;target=value>=0?[245,168,86]:[71,207,222];value=Math.min(1,Math.abs(value));
      }
      r+=value*(target[0]-r);g+=value*(target[1]-g);b+=value*(target[2]-b);
    }
    data[k]=r;data[k+1]=g;data[k+2]=b;data[k+3]=255;
  }
  fieldCtx.putImageData(pixels,0,0);
  ctx.imageSmoothingEnabled=true;ctx.drawImage(field,0,0,canvas.width,canvas.height);
  // A subtle coordinate grid keeps the flow legible without concealing it.
  ctx.strokeStyle='rgba(140,175,194,.045)';ctx.lineWidth=1;ctx.beginPath();
  for(let x=0;x<W;x+=20){ctx.moveTo(x*SX,0);ctx.lineTo(x*SX,canvas.height);}
  for(let y=0;y<H;y+=20){ctx.moveTo(0,y*SY);ctx.lineTo(canvas.width,y*SY);}ctx.stroke();
  if($('particles').checked) {
    ctx.strokeStyle='rgba(236,255,255,.26)';ctx.lineWidth=1.1;ctx.beginPath();
    for(const p of particles) {
      if(p.trail.length){ctx.moveTo(p.trail[0][0]*SX,p.trail[0][1]*SY);for(const pos of p.trail)ctx.lineTo(pos[0]*SX,pos[1]*SY);ctx.lineTo(p.x*SX,p.y*SY);}
    }ctx.stroke();ctx.fillStyle='rgba(230,253,255,.82)';
    ctx.beginPath();for(const p of particles){ctx.moveTo(p.x*SX+1.6,p.y*SY);ctx.arc(p.x*SX,p.y*SY,1.6,0,Math.PI*2);}ctx.fill();
  }
  if($('vectors').checked) {
    ctx.strokeStyle='rgba(224,248,252,.6)';ctx.lineWidth=1.4;
    for(let y=10;y<H-6;y+=10)for(let x=10;x<W-6;x+=12){const i=x+y*W;if(sim.solid[i])continue;arrow(x*SX,y*SY,sim.ux[i]*SX*45,sim.uy[i]*SY*45);}
  }
  if($('force').checked) {
    let x=0,y=0,count=0;for(let i=0;i<sim.n;i++)if(sim.solid[i]){x+=i%W;y+=Math.floor(i/W);count++;}
    if(count) {
      ctx.strokeStyle='#b4f89d';ctx.lineWidth=3;
      const length=Math.min(120,Math.hypot(sim.forceX,sim.forceY)*160);
      const direction=Math.atan2(sim.forceY,sim.forceX);
      arrow(x/count*SX,y/count*SY,length*Math.cos(direction),length*Math.sin(direction));
      ctx.fillStyle='#b4f89d';ctx.font='16px system-ui';ctx.fillText('Model force',x/count*SX+12,y/count*SY-20);
    }
  }
  if(sensor) {
    ctx.strokeStyle='#fff';ctx.lineWidth=2;const x=sensor.x*SX,y=sensor.y*SY;
    ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.moveTo(x-14,y);ctx.lineTo(x-5,y);ctx.moveTo(x+5,y);ctx.lineTo(x+14,y);ctx.moveTo(x,y-14);ctx.lineTo(x,y-5);ctx.moveTo(x,y+5);ctx.lineTo(x,y+14);ctx.stroke();
  }
}
function arrow(x,y,dx,dy) {
  if(Math.hypot(dx,dy)<1)return;
  const a=Math.atan2(dy,dx),head=Math.min(6,Math.hypot(dx,dy)*.4),ex=x+dx,ey=y+dy;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.moveTo(ex-head*Math.cos(a-.5),ey-head*Math.sin(a-.5));ctx.lineTo(ex,ey);ctx.lineTo(ex-head*Math.cos(a+.5),ey-head*Math.sin(a+.5));ctx.stroke();
}
function moveParticles(steps) {
  // Short midpoint steps follow curved paths and avoid jumping through thin barriers.
  const substeps=Math.max(1,Math.ceil(steps/2)),dt=steps/substeps;
  const velocityAt=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,i=ix+iy*W;
    const interpolate=arr=>arr[i]*(1-tx)*(1-ty)+arr[i+1]*tx*(1-ty)+arr[i+W]*(1-tx)*ty+arr[i+W+1]*tx*ty;
    return [interpolate(sim.ux),interpolate(sim.uy)];
  };
  const valid=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=1&&x<W-2&&y>=2&&y<H-2&&!sim.solid[Math.floor(x)+Math.floor(y)*W];
  for(let j=0;j<particles.length;j++) {
    const p=particles[j];p.trail.push([p.x,p.y]);if(p.trail.length>maxTrailPoints)p.trail.shift();
    for(let k=0;k<substeps;k++){
      if(!valid(p.x,p.y)){particles[j]=makeParticle(false);break;}
      const [u,v]=velocityAt(p.x,p.y),mx=p.x+u*dt*.5,my=p.y+v*dt*.5;
      if(!valid(mx,my)){particles[j]=makeParticle(false);break;}
      const [mu,mv]=velocityAt(mx,my);p.x+=mu*dt;p.y+=mv*dt;
      if(!valid(p.x,p.y)){particles[j]=makeParticle(false);break;}
    }
  }
}
function updateProbe() {
  if(!sensor)return;
  const s=sim.sample(sensor.x,sensor.y);$('sensorReadout').hidden=false;
  $('sensorText').textContent=s.solid?'Inside a barrier — choose a fluid point.':`Speed ${s.speed.toFixed(3)} · Density ${s.density.toFixed(3)} · Step ${sim.time.toLocaleString()}`;
}
function runSteps(count,budgetMs=Infinity) {
  const start=performance.now();let completed=0;
  try{
    while(completed<count){sim.step();completed++;if(performance.now()-start>=budgetMs)break;}
    moveParticles(completed);simulatedSteps+=completed;return completed;
  }
  catch{running=false;sim.reset();resetParticles();syncRunning();notify('The flow became unstable and was reset. Try a gentler speed or higher viscosity.');return 0;}
}

function engineLabel(message,fallback=false){
  $('engineStatus').textContent=message;
  $('engineStatus').dataset.fallback=String(fallback);
}
function resetRustField(){
  if(!wasmActive||!wasmWorker)return;
  engineRevision++;
  workerInFlight=0;
  // Always copy the current obstacle mask; drag/draw tools modify it on the UI thread.
  wasmWorker.postMessage({type:'reset',revision:engineRevision,
    speed:sim.speed,viscosity:sim.viscosity,solid:sim.solid.slice()});
}
function updateRustParameters(){
  if(wasmActive&&wasmWorker)wasmWorker.postMessage({
    type:'params',speed:sim.speed,viscosity:sim.viscosity
  });
}
function endRustEngine(reason){
  if(wasmWorker){wasmWorker.terminate();wasmWorker=null;}
  wasmActive=false;wasmStarting=false;workerInFlight=0;manualSteps=0;
  // JS fallback must have f64 velocity fields for normal numeric operation.
  sim.rho=new Float64Array(sim.n);
  sim.ux=new Float64Array(sim.n);
  sim.uy=new Float64Array(sim.n);
  sim.reset();pendingSteps=0;resetParticles();paint();
  engineLabel('JavaScript fallback · '+reason,true);
  if(reason!=='selected')notify('Rust/WASM unavailable. The JavaScript simulator is still working.');
}
function publishRustStep(count,budgetMs,now){
  if(!wasmActive||!wasmWorker||workerInFlight)return;
  workerInFlight=++workerRequest;
  lastWorkerRequest=now;
  wasmWorker.postMessage({type:'step',revision:engineRevision,
    requestId:workerInFlight,count,budgetMs});
}
function beginRustEngine(){
  $('engine').value=engineChoice;
  if(!requestedWasm){
    engineLabel('JavaScript · selected');
    return;
  }
  if(typeof Worker==='undefined'||typeof WebAssembly==='undefined'){
    engineLabel('JavaScript fallback · Rust not supported',true);
    return;
  }
  wasmStarting=true;
  engineLabel('Loading Rust/WASM…');
  try{
    const worker=new Worker(new URL('./student-wasm-worker.mjs',import.meta.url),{type:'module'});
    wasmWorker=worker;
    worker.onerror=event=>{
      event.preventDefault();
      endRustEngine('worker error');
    };
    worker.onmessage=({data})=>{
      if(worker!==wasmWorker)return;
      if(data.type==='ready'){
        wasmStarting=false;wasmActive=true;
        // The user could have changed controls while WASM was loading.
        sim.reset();resetParticles();pendingSteps=0;workerInFlight=0;
        resetRustField();
        engineLabel((engineChoice==='auto'?'Auto · ':'')+'Rust/WASM worker');
        notify('Rust/WASM is active. Flow restarted using your current settings.');
        paint();
      }else if(data.type==='error'){
        endRustEngine('simulation error');
      }else if(data.type==='skipped'){
        if(data.requestId===workerInFlight)workerInFlight=0;
      }else if(data.type==='frame'){
        if(data.requestId===workerInFlight)workerInFlight=0;
        if(data.revision!==engineRevision)return;
        // Float32 fields are for drawing only. The Rust solver remains f64.
        const previous=[sim.rho,sim.ux,sim.uy];
        sim.rho=data.fields.rho;sim.ux=data.fields.ux;sim.uy=data.fields.uy;
        const buffers=previous.filter(v=>v instanceof Float32Array&&v.length===sim.n).map(v=>v.buffer);
        if(buffers.length===3)worker.postMessage({type:'recycle',buffers},buffers);
        sim.time=data.time;sim.inletSpeed=data.inletSpeed;
        sim.forceX=data.forceX;sim.forceY=data.forceY;
        simulatedSteps+=data.steps;
        pendingSteps=Math.max(0,pendingSteps-data.steps);
        if(data.steps>0)moveParticles(data.steps);
        if(performance.now()-lastPaint>=paintInterval){paint();lastPaint=performance.now();}
      }
    };
    worker.postMessage({type:'init',width:W,height:H,speed:sim.speed,viscosity:sim.viscosity});
  }catch{
    endRustEngine('initialization failed');
  }
}

function frame(now) {
  const elapsed=lastFrame?Math.min(100,now-lastFrame):0;lastFrame=now;
  const drawing=pointer&&['draw','erase','move'].includes(pointer.action);
  if(running&&!document.hidden&&!drawing){
    const animation=Number($('animation').value),superFast=animation===24;
    pendingSteps=Math.min(superFast?48:18,pendingSteps+elapsed*animation*.03);
    const count=Math.floor(pendingSteps);
    if(wasmActive){
      if(count&&!workerInFlight&&now-lastWorkerRequest>=Math.max(1000/30,paintInterval)){
        // The Worker can use a longer compute slice without blocking the UI thread.
        const budgetMs=useFastGrid?(superFast?34:25):(superFast?36:29);
        publishRustStep(count,budgetMs,now);
      }
    }else if(count){
      const budgetMs=useFastGrid?(superFast?18:9):(superFast?36:12);
      pendingSteps-=runSteps(count,budgetMs);
      if(now-lastPaint>=paintInterval){paint();lastPaint=now;}
    }
  }else pendingSteps=0;
  if(wasmActive&&manualSteps>0&&!workerInFlight){
    const count=Math.min(48,manualSteps);manualSteps-=count;
    publishRustStep(count,Number.POSITIVE_INFINITY,now);
  }
  if(now-performanceWindow>=1000){
    const seconds=(now-performanceWindow)/1000;
    $('livePerformance').textContent='Canvas: '+Math.round(paintedFrames/seconds)+
      ' fps · Flow: '+Math.round(simulatedSteps/seconds)+' steps/s';
    performanceWindow=now;paintedFrames=0;simulatedSteps=0;
  }
  if(now-lastReadout>250&&!document.hidden){
    updateProbe();
    updateRunStatus();
    lastReadout=now;
  }
  requestAnimationFrame(frame);
}
function updateRunStatus() {
  const settling=Math.abs(sim.inletSpeed-sim.speed)>.0003;
  const label=running?(settling?'Adjusting flow':'Running'):'Paused';
  $('runState').textContent=`${label} · ${sim.time.toLocaleString()} steps`;
  $('speedValue').title=settling?`Current inlet: ${sim.inletSpeed.toFixed(3)}; target: ${sim.speed.toFixed(3)}`:'Inlet flow speed';
}
function syncRunning() {
  if(!running)pendingSteps=0;
  $('playButton').querySelector('span').textContent=running?'Pause':'Play';
  $('playIcon').innerHTML=running?'<path d="M6 4v12M14 4v12"/>':'<path d="m6 3 10 7-10 7V3Z"/>';
  $('runDot').classList.toggle('paused',!running);updateRunStatus();
  $('playButton').setAttribute('aria-label',running?'Pause simulation':'Play simulation');
}
function press(group,value){document.querySelectorAll(`[data-${group}]`).forEach(el=>el.setAttribute('aria-pressed',String(el.dataset[group]===value)));}
function setView(next) {
  view=next;press('view',view);
  const info={curl:['Clockwise','Anticlockwise','Colour shows local rotation','linear-gradient(90deg,#faaf58,#102030,#55d4e6)'],speed:['Still','0.400+','Fixed scale · simulation units','linear-gradient(90deg,#0b1826,#1a87a9,#f7d067)'],density:['0.800−','1.200+','Density around the reference value 1','linear-gradient(90deg,#47cfde,#102030,#f5a856)']}[view];
  $('legendLow').textContent=info[0];$('legendHigh').textContent=info[1];$('legendNote').textContent=info[2];$('legendGradient').style.background=info[3];paint();
}
function shapeSelected(shape,angle=0,preservePosition=false) {
  sim.setShape(shape,angle,preservePosition?{x:sim.centerX,y:sim.centerY}:null);resetParticles();press('shape',shape);$('angle').value=angle;$('angleValue').textContent=`${angle}°`;
  const disabled=['custom','none'].includes(shape);$('angle').disabled=disabled;
  $('observation').innerHTML=notes[shape];$('canvasNote').textContent=shape==='none'?'Add a shape to disturb the flow':`Watch the wake behind the ${names[shape].toLowerCase()}`;
  if(shape!=='none'&&!preservePosition)toolSelected('move');
  pendingSteps=0;resetRustField();updateRunStatus();updateProbe();paint();
}
function flowReset(){sim.reset();pendingSteps=0;resetParticles();resetRustField();updateRunStatus();updateProbe();paint();}
function toolSelected(next) {
  tool=next;press('tool',tool);
  $('toolHint').textContent={move:'Drag the object to reposition it. Release to restart the flow. Arrow keys move it too.',probe:'Click anywhere in the flow to measure its speed.',draw:'Drag to draw a barrier. Leave space for the flow to go around it.',erase:'Drag across a barrier to erase it.',push:'Drag gently through the fluid to create a small disturbance.'}[tool];
  canvas.style.cursor=tool==='push'||tool==='move'?'grab':'crosshair';
}
function hitObject(p,radius=4) {
  for(let y=Math.max(0,Math.floor(p.y-radius));y<=Math.min(H-1,p.y+radius);y++)
    for(let x=Math.max(0,Math.floor(p.x-radius));x<=Math.min(W-1,p.x+radius);x++)
      if((x-p.x)**2+(y-p.y)**2<=radius*radius&&sim.solid[x+y*W])return true;
  return false;
}
function moveObjectBy(dx,dy) {
  const moved=sim.translateMask(sim.solid.slice(),dx,dy);
  if(moved){flowReset();return moved;}
  return null;
}
function position(event) {
  const r=canvas.getBoundingClientRect();return {x:Math.max(2,Math.min(W-3,(event.clientX-r.left)/r.width*W)),y:Math.max(2,Math.min(H-3,(event.clientY-r.top)/r.height*H))};
}
function editSegment(from,to) {
  const distance=Math.hypot(to.x-from.x,to.y-from.y),segments=Math.ceil(distance/1.5)||1;
  for(let i=0;i<=segments;i++){const t=i/segments;sim.brush(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t,tool==='erase'?3:2,tool==='erase');}
  press('shape','custom');$('angle').disabled=true;$('observation').innerHTML=notes.custom;$('canvasNote').textContent='Your custom barrier';
}
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||pointer)return;event.preventDefault();canvas.focus({preventScroll:true});
  const p=position(event);
  if(tool==='move'&&!hitObject(p,event.pointerType==='touch'?7:4)){notify('Drag the object itself. Choose a shape first if the tunnel is empty.');return;}
  pointer={...p,id:event.pointerId,action:tool};
  if(tool==='move'){
    pointer.start={...p};pointer.origin={x:sim.centerX,y:sim.centerY};pointer.mask=sim.solid.slice();pointer.moved=false;
    canvas.style.cursor='grabbing';pendingSteps=0;
  }
  canvas.setPointerCapture(event.pointerId);
  if(tool==='probe'){sensor=p;updateProbe();}
  else if(tool==='draw'||tool==='erase')editSegment(p,p);
  paint();
});
canvas.addEventListener('pointermove',event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  const p=position(event);
  if(pointer.action==='move'){
    const result=sim.translateMask(pointer.mask,p.x-pointer.start.x,p.y-pointer.start.y,pointer.origin);
    pointer.moved=!!result&&(result.dx!==0||result.dy!==0);
  }else if(pointer.action==='probe'){sensor=p;updateProbe();}
  else if(pointer.action==='push'){
    if(wasmActive)wasmWorker.postMessage({type:'push',x:p.x,y:p.y,dx:p.x-pointer.x,dy:p.y-pointer.y});
    else sim.push(p.x,p.y,p.x-pointer.x,p.y-pointer.y);
  }
  else editSegment(pointer,p);
  pointer.x=p.x;pointer.y=p.y;paint();
});
function endPointer(event){
  if(!pointer||event.pointerId!==pointer.id)return;
  const reset=['draw','erase'].includes(pointer.action)||(pointer.action==='move'&&pointer.moved);
  pointer=null;canvas.style.cursor=tool==='push'||tool==='move'?'grab':'crosshair';
  if(reset)flowReset();
  // When paused, refresh the flow visualization after using Stir.
  if(wasmActive&&tool==='push'&&!running&&!workerInFlight)
    publishRustStep(0,0,performance.now());
}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',endPointer);
canvas.addEventListener('keydown',event=>{
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(tool==='move'&&directions[event.key]&&!pointer){
    event.preventDefault();const [dx,dy]=directions[event.key],amount=event.shiftKey?5:1;
    if(!moveObjectBy(dx*amount,dy*amount))notify('Choose or draw a shape before moving it.');
  }
  if(tool==='probe'&&directions[event.key]){
    event.preventDefault();if(!sensor)sensor={x:W*.6,y:H*.5};const d=directions[event.key],step=event.shiftKey?5:1;
    sensor={x:Math.max(2,Math.min(W-3,sensor.x+d[0]*step)),y:Math.max(2,Math.min(H-3,sensor.y+d[1]*step))};updateProbe();paint();
  }
});
document.querySelectorAll('[data-shape]').forEach(el=>el.addEventListener('click',()=>shapeSelected(el.dataset.shape,Number($('angle').value))));
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
document.querySelectorAll('[data-tool]').forEach(el=>el.addEventListener('click',()=>toolSelected(el.dataset.tool)));
$('playButton').addEventListener('click',()=>{running=!running;syncRunning();});
$('stepButton').addEventListener('click',()=>{
  running=false;pendingSteps=0;
  if(wasmActive)manualSteps+=10;
  else {runSteps(10);paint();updateProbe();}
  syncRunning();
});
$('resetButton').addEventListener('click',flowReset);
$('clearButton').addEventListener('click',()=>shapeSelected('none',0));
$('closeSensor').addEventListener('click',()=>{sensor=null;$('sensorReadout').hidden=true;paint();});
$('angle').addEventListener('input',()=>shapeSelected(sim.shape,Number($('angle').value),true));
$('animation').addEventListener('change',()=>{pendingSteps=0;});
$('quality').value=qualityOption;
$('engine').value=engineChoice;
$('engine').addEventListener('change',()=>{
  const url=new URL(location.href),choice=$('engine').value;
  if(choice==='auto')url.searchParams.delete('engine');
  else url.searchParams.set('engine',choice);
  location.assign(url.toString());
});
$('qualityStatus').textContent=useFastGrid?'Fast grid · 168 × 72':'Detailed grid · 240 × 104';
$('quality').addEventListener('change',()=>{
  const next=$('quality').value;
  const url=new URL(location.href);
  if(next==='auto')url.searchParams.delete('quality');
  else url.searchParams.set('quality',next);
  location.assign(url.toString());
});
$('speed').addEventListener('input',()=>{sim.speed=Number($('speed').value);$('speedValue').textContent=sim.speed.toFixed(3);updateRustParameters();paint();});
$('viscosity').addEventListener('input',()=>{sim.viscosity=Number($('viscosity').value);$('viscosityValue').textContent=sim.viscosity.toFixed(3);updateRustParameters();paint();});
['particles','vectors','force'].forEach(id=>$(id).addEventListener('change',paint));
$('viscosityInfo').addEventListener('click',()=>notify('Viscosity is a fluid’s resistance to shear. In this model, higher viscosity smooths out motion and can make swirls fade sooner.'));
$('fullscreenButton').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{notify('Fullscreen is not available here. You can use your browser’s fullscreen command.');}
});
$('guideButton').addEventListener('click',()=>$('guideDialog').showModal());
$('aboutButton').addEventListener('click',()=>$('aboutDialog').showModal());
document.querySelectorAll('.dialog-close').forEach(el=>el.addEventListener('click',()=>el.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
document.addEventListener('keydown',event=>{
  if(['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;
  if(event.code==='Space'){event.preventDefault();running=!running;syncRunning();}
  if(event.key.toLowerCase()==='r')flowReset();
});

let demoPhase=0;
function setLevel(level){
  document.body.dataset.level=level;press('level',level);
  if(level==='beginner'){toolSelected('move');if(view==='density')setView('curl');$('vectors').checked=false;$('force').checked=false;paint();}
}
document.querySelectorAll('[data-level]').forEach(el=>el.addEventListener('click',()=>setLevel(el.dataset.level)));
$('demoButton').addEventListener('click',()=>{
  setLevel('beginner');sim.speed=.085;sim.viscosity=.025;$('speed').value=.085;$('speedValue').textContent='0.085';$('viscosity').value=.025;$('viscosityValue').textContent='0.025';
  $('animation').value='7';shapeSelected('block',0);setView('speed');running=true;syncRunning();demoPhase=1;$('nextDemo').hidden=false;
  $('demoStatus').textContent='Step 1/2: Watch the wake behind the block, then try the next shape.';
  $('canvasWrap').scrollIntoView({behavior:'smooth',block:'center'});
});
$('nextDemo').addEventListener('click',()=>{
  if(demoPhase!==1)return;shapeSelected('streamlined',0);setView('speed');running=true;syncRunning();demoPhase=2;$('nextDemo').hidden=true;
  $('demoStatus').textContent='Step 2/2: Same wind speed, different shape. How has the wake changed? Compare after similar simulation steps.';
  $('canvasWrap').scrollIntoView({behavior:'smooth',block:'center'});
});
const experiments={
  shapes:{label:'01 / SHAPE TEST',title:'Which shape leaves a narrower wake?',text:'Try the block, then the streamlined shape. Both have the same front-facing height at 0°. Keep the flow settings unchanged and compare after a similar number of steps.',predict:'Which shape will disturb the flow more?',observe:'Follow particles behind each shape.',explain:'Use what you see to support your answer.'},
  speed:{label:'02 / SPEED TEST',title:'What changes when the flow gets faster?',text:'Keep the circle and viscosity unchanged. Compare speeds of 0.040, 0.100 and 0.200. Use Reset flow for each fresh test, then compare after a similar number of steps.',predict:'Will faster flow create a different wake?',observe:'Compare the swirls and particle paths.',explain:'Describe one change you can actually see.'},
  angle:{label:'03 / ANGLE TEST',title:'What happens when you tilt the shape?',text:'Start with the streamlined shape at 0°. Try 20°, keeping flow speed and viscosity unchanged. Compare the flow above and below the shape.',predict:'Will the flow stay balanced on both sides?',observe:'Use direction arrows and the speed view.',explain:'Explain how the angle changed the flow.'}
};
function selectExperiment(next){
  experiment=next;press('experiment',next);const e=experiments[next];
  for(const [id,key]of [['challengeLabel','label'],['challengeTitle','title'],['challengeText','text'],['predictText','predict'],['observeText','observe'],['explainText','explain']])$(id).textContent=e[key];
  const options={shapes:['Block leaves a narrower wake','Streamlined leaves a narrower wake'],speed:['Faster flow changes the wake','Faster flow makes little difference'],angle:['Tilting changes the flow balance','Tilting makes little difference']}[next];
  $('prediction').options[1].textContent=options[0];$('prediction').options[2].textContent=options[1];$('prediction').value='';$('conclusion').value='';
}
document.querySelectorAll('[data-experiment]').forEach(el=>el.addEventListener('click',()=>selectExperiment(el.dataset.experiment)));
function setupExperiment(){
  sim.viscosity=.025;sim.speed=experiment==='speed'?.040:.085;
  $('viscosity').value=sim.viscosity;$('viscosityValue').textContent=sim.viscosity.toFixed(3);$('speed').value=sim.speed;$('speedValue').textContent=sim.speed.toFixed(3);
  shapeSelected(experiment==='shapes'?'block':experiment==='angle'?'streamlined':'circle',0);
  $('particles').checked=true;$('vectors').checked=experiment==='angle';setView(experiment==='angle'?'speed':'curl');
  toolSelected('probe');running=true;syncRunning();notify('Experiment ready. Watch the flow settle, then capture your first view.');
}
$('setupExperiment').addEventListener('click',setupExperiment);
function capture() {
  paint();const s=sensor?sim.sample(sensor.x,sensor.y):null;
  if(captures.length>=2){notify('Remove a captured view to make room for another.');return null;}
  const record={image:canvas.toDataURL('image/png'),shape:sim.shape,angle:sim.angle,position:{x:sim.centerX,y:sim.centerY},speed:sim.speed,inletSpeed:sim.inletSpeed,viscosity:sim.viscosity,steps:sim.time,view,probe:s&&!s.solid?s:null,note:''};
  captures.push(record);renderCaptures();notify(`View ${captures.length===1?'A':'B'} captured. ${captures.length===1?'Change one variable for your next view.':'Compare the two views below.'}`);
  return {shape:record.shape,speed:record.speed,steps:record.steps,count:captures.length};
}
function renderCaptures() {
  const root=$('captures');root.replaceChildren();root.hidden=captures.length===0;
  captures.forEach((record,index)=>{
    const figure=document.createElement('figure');figure.className='capture-card';
    const image=document.createElement('img');image.src=record.image;image.alt=`Captured ${viewNames[record.view].toLowerCase()} view of ${names[record.shape].toLowerCase()} at speed ${record.speed.toFixed(3)}`;figure.append(image);
    const caption=document.createElement('figcaption');caption.className='capture-caption';
    const heading=document.createElement('div'),title=document.createElement('strong');title.textContent=`View ${index===0?'A':'B'} · ${names[record.shape]}`;
    const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label',`Remove view ${index===0?'A':'B'}`);remove.addEventListener('click',()=>{captures.splice(index,1);renderCaptures();});heading.append(title,remove);caption.append(heading);
    const meta=document.createElement('div');meta.textContent=`Speed ${record.speed.toFixed(3)} · Viscosity ${record.viscosity.toFixed(3)} · ${record.angle}° · ${record.steps.toLocaleString()} steps · ${viewNames[record.view]}`;caption.append(meta);
    if(record.shape!=='none'){const location=document.createElement('div');location.textContent=`Object position (${record.position.x}, ${record.position.y})`;caption.append(location);}
    if(Math.abs(record.inletSpeed-record.speed)>.0003){const transition=document.createElement('div');transition.textContent=`Flow still adjusting: inlet ${record.inletSpeed.toFixed(3)} toward ${record.speed.toFixed(3)}.`;caption.append(transition);}
    if(record.probe){const probe=document.createElement('div');probe.textContent=`Probe (${record.probe.x}, ${record.probe.y}): speed ${record.probe.speed.toFixed(3)}`;caption.append(probe);}
    const label=document.createElement('label');label.textContent='What did you notice?';
    const text=document.createElement('textarea');text.placeholder='Describe the wake or particle paths…';text.value=record.note;text.addEventListener('input',()=>record.note=text.value);label.append(text);caption.append(label);
    const download=document.createElement('a');download.className='download';download.href=record.image;download.download=`airflow-${record.shape}-view-${index===0?'a':'b'}.png`;download.textContent='Download image';caption.append(download);figure.append(caption);root.append(figure);
  });
  if(captures.length===1){const empty=document.createElement('div');empty.className='capture-empty';empty.textContent='Your second view will appear here.';root.append(empty);}
  $('captureButton').disabled=captures.length>=2;
  $('exportComparison').disabled=captures.length!==2;
}
$('captureButton').addEventListener('click',capture);
function reportLines(c,text,x,y,width,spacing,max=2){
  const words=String(text||'No observation entered').split(/\s+/);let line='',count=0;
  for(const word of words){const next=line?line+' '+word:word;if(line&&c.measureText(next).width>width){c.fillText(line,x,y+spacing*count++);line=word;if(count>=max)return;}else line=next;}
  if(count<max)c.fillText(line,x,y+spacing*count);
}
async function exportReport(){
 if(captures.length!==2)return;
 const imageList=await Promise.all(captures.map(item=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=item.image;})));
 const sheet=document.createElement('canvas');sheet.width=1840;sheet.height=920;const c=sheet.getContext('2d');
 c.fillStyle='#f3f6f8';c.fillRect(0,0,1840,920);c.fillStyle='#0e1824';c.fillRect(0,0,1840,125);
 c.fillStyle='#5de4d1';c.font='bold 36px sans-serif';c.fillText('AIRFLOW LAB / A–B COMPARISON',40,54);
 c.fillStyle='#e4eff2';c.font='22px sans-serif';c.fillText(experiments[experiment].title,40,94);
 captures.forEach((r,n)=>{const x=40+n*920;c.fillStyle='#fff';c.fillRect(x,144,900,585);c.drawImage(imageList[n],x+10,155,880,381);
  c.fillStyle='#163445';c.font='bold 25px sans-serif';c.fillText('VIEW '+(n?'B':'A')+' · '+names[r.shape],x+12,574);
  c.fillStyle='#566c7c';c.font='19px sans-serif';c.fillText('Flow '+r.speed.toFixed(3)+' · Viscosity '+r.viscosity.toFixed(3)+' · Angle '+r.angle+'°',x+12,610);
  c.fillText(r.steps.toLocaleString()+' steps · '+viewNames[r.view],x+12,645);
  c.fillStyle='#163445';c.font='18px sans-serif';reportLines(c,r.note,x+12,686,860,24,2);
 });
 const p=$('prediction');c.font='19px sans-serif';c.fillStyle='#163445';
 reportLines(c,'Prediction: '+(p.selectedIndex?p.options[p.selectedIndex].textContent:'Not recorded'),40,778,1740,25,1);
 reportLines(c,'Explanation: '+$('conclusion').value,40,811,1740,26,2);
 c.fillStyle='#637989';c.font='17px sans-serif';c.fillText('Simplified 2D learning model · Simulation units · Not a calibrated aerodynamic test',40,892);
 sheet.toBlob(blob=>{if(!blob){notify('Report export unavailable on this device.');return;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='airflow-lab-comparison.png';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);notify('Comparison report ready. Check your downloads.');
 },'image/png');
}
$('exportComparison').addEventListener('click',()=>exportReport().catch(()=>notify('Could not export report. Try downloading views separately.')));

// Optional browser-native tools share the visible controls and state.
const modelContext=navigator.modelContext||document.modelContext;
const lifecycle=new AbortController();
if(modelContext?.registerTool) {
  const register=definition=>{try{Promise.resolve(modelContext.registerTool(definition,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  const state=()=>({shape:sim.shape,position:{x:sim.centerX,y:sim.centerY},animation:Object.keys(animationModes).find(key=>animationModes[key]===Number($('animation').value)),angle:sim.angle,speed:sim.speed,inletSpeed:sim.inletSpeed,viscosity:sim.viscosity,view,running,steps:sim.time,captures:captures.length,probe:sensor?sim.sample(sensor.x,sensor.y):null});
  register({name:'read_wind_tunnel',description:'Read the current wind-tunnel settings and optional probe measurement.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>state()});
  register({name:'configure_wind_tunnel',description:'Change visible wind-tunnel settings. Shape or angle changes reset the fluid. Speed changes blend into the current flow; viscosity changes preserve it. Does not capture a view.',inputSchema:{type:'object',properties:{shape:{type:'string',enum:presetNames},angle:{type:'number',minimum:-45,maximum:45,multipleOf:5},speed:{type:'number',minimum:0,maximum:.2,multipleOf:.005},viscosity:{type:'number',minimum:.02,maximum:.15,multipleOf:.005},view:{type:'string',enum:['curl','speed','density']},running:{type:'boolean'},animation:{type:'string',enum:Object.keys(animationModes)}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a settings object.');
    const allowed=['shape','angle','speed','viscosity','view','running','animation'];
    if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('Unknown setting.');
    if(input.shape!==undefined&&!presetNames.includes(input.shape))throw new Error('Unknown shape.');
    if(input.view!==undefined&&!['curl','speed','density'].includes(input.view))throw new Error('Unknown view.');
    for(const [key,min,max,step]of [['angle',-45,45,5],['speed',0,.2,.005],['viscosity',.02,.15,.005]])if(input[key]!==undefined&&(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<min||input[key]>max||Math.abs(input[key]/step-Math.round(input[key]/step))>1e-7))throw new Error(`Invalid ${key}.`);
    if(input.animation!==undefined&&!Object.hasOwn(animationModes,input.animation))throw new Error('Unknown animation speed.');
    if(input.running!==undefined&&typeof input.running!=='boolean')throw new Error('running must be boolean.');
    if(input.angle!==undefined&&['custom','none'].includes(input.shape??sim.shape))throw new Error('Choose a preset shape before setting its angle.');
    if(input.speed!==undefined){sim.speed=input.speed;$('speed').value=input.speed;$('speedValue').textContent=input.speed.toFixed(3);}
    if(input.viscosity!==undefined){sim.viscosity=input.viscosity;$('viscosity').value=input.viscosity;$('viscosityValue').textContent=input.viscosity.toFixed(3);}
    if(input.shape!==undefined||input.angle!==undefined)shapeSelected(input.shape??sim.shape,input.angle??sim.angle,input.shape===undefined);
    if(input.animation!==undefined){$('animation').value=animationModes[input.animation];pendingSteps=0;}
    if(input.view!==undefined)setView(input.view);
    if(input.running!==undefined){running=input.running;syncRunning();}
    updateProbe();paint();return state();
  }});
  register({name:'move_wind_tunnel_object',description:'Reposition the entire obstacle, keep it inside the tunnel, and restart the flow at its new position. Coordinates are simulation grid coordinates; returns the actual clamped position.',inputSchema:{type:'object',properties:{x:{type:'number',minimum:0,maximum:W-1},y:{type:'number',minimum:0,maximum:H-1}},required:['x','y'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['x','y'].includes(key))||typeof input.x!=='number'||typeof input.y!=='number'||!Number.isFinite(input.x)||!Number.isFinite(input.y)||input.x<0||input.x>=W||input.y<0||input.y>=H)throw new Error('Provide valid x and y grid coordinates.');
    if(!moveObjectBy(input.x-sim.centerX,input.y-sim.centerY))throw new Error('Choose or draw an object first.');
    toolSelected('move');return state();
  }});
  register({name:'capture_wind_tunnel_view',description:'Capture the current rendered view for the visible two-view comparison. Fails when both slots are occupied.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(captures.length>=2)throw new Error('Both comparison slots are full.');return capture();}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
setLevel('beginner');resetParticles();syncRunning();setView('curl');toolSelected('move');beginRustEngine();requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{if(wasmWorker)wasmWorker.terminate();},{once:true});
