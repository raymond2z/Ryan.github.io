import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {FluidSimulation} from './simulation.mjs';
import {EXTRA_SHAPES,shapePreview} from './shapes.mjs';
import {makeAdaptiveStepper,STEP_FIXED,MAX_TRACER_DEBT,createGpuPaintPacer,forceFrameTiming} from './live-performance.mjs';
import {createStabilityRecorder,STABILITY_BUILD} from './stability-recorder.mjs';
import {createMatchedComparison,comparisonPlan,comparisonDifferences,seededRandom} from './shape-comparison.mjs';

const settings={grid:{width:240,height:104},position:{x:72,y:52},speed:.085,viscosity:.025};
test('every batch size reaches exactly the same observation point for A and B',()=>{
  for(const batch of [3,4,7,8,24,48]){
    const c=createMatchedComparison();c.start(settings);
    for(const shape of ['block','streamlined']){
      assert.equal(c.shape,shape);let steps=0;
      while(c.running){steps+=c.limit(batch,steps);c.complete(steps);}
      assert.equal(steps,2000);
      if(shape==='block'){assert.equal(c.phase,'ready-b');c.next();}
    }
    assert.equal(c.phase,'done');assert.equal(c.active,false);
  }
});
test('shared positions keep both real preset masks inside the grid with equal frontal height',()=>{
  for(const [width,height]of [[240,104],[168,72]])for(const position of [{x:0,y:0},{x:width-1,y:height-1},{x:width*.3,y:height*.5}]){
    const plan=comparisonPlan({...settings,grid:{width,height},position});
    const sim=new FluidSimulation(width,height),heights=[];
    for(const shape of ['block','streamlined']){
      sim.setShape(shape,0,plan.position);const b=sim.obstacleBounds();
      assert.deepEqual({x:sim.centerX,y:sim.centerY},plan.position);
      assert.ok(b.minX>=8&&b.minY>=8&&b.maxX<=width-9&&b.maxY<=height-9);
      heights.push(b.maxY-b.minY+1);assert.equal(sim.time,0);assert.equal(sim.inletSpeed,sim.speed);
    }
    assert.ok(Math.abs(heights[0]-heights[1])<=1);
  }
});
test('cancel, invalid sequencing and missed observation points cannot silently become a completed comparison',()=>{
  const c=createMatchedComparison();assert.throws(()=>c.next());c.start(settings);
  assert.throws(()=>c.start(settings));assert.equal(c.complete(1999),false);
  assert.throws(()=>c.complete(2001));assert.equal(c.phase,'failed');assert.equal(c.active,false);
  c.start(settings);c.cancel();assert.equal(c.remaining(0),Infinity);assert.equal(c.active,false);
  c.start(settings);const p=c.plan;p.speed=9;assert.equal(c.plan.speed,.085);
});
test('manual comparisons reveal confounding conditions and settling flow',()=>{
  const a={...settings,shape:'block',angle:0,steps:2000,engine:'webgpu',view:'speed',inletSpeed:.085,obstacleHeight:31};
  const b={...a,shape:'streamlined'};
  assert.deepEqual(comparisonDifferences(a,b),[]);
  assert.deepEqual(comparisonDifferences(a,{...b,speed:.1,inletSpeed:.09,steps:1900,position:{x:80,y:52},grid:{width:168,height:72},obstacleHeight:40}),
    ['wind speed','elapsed steps','object position','grid','flow still adjusting','front-facing height']);
});
test('tracer reset gives the same starting markers without replacing global randomness',()=>{
  const a=seededRandom(),b=seededRandom();
  for(let i=0;i<100;i++){const n=a();assert.equal(n,b());assert.ok(n>=0&&n<1);}
});
test('manual speed and angle experiments recognize the chosen variable instead of requiring different shapes',()=>{
  const a={...settings,shape:'circle',angle:0,steps:2000,engine:'wasm',view:'speed',inletSpeed:.085,obstacleHeight:31,experiment:'speed'};
  assert.deepEqual(comparisonDifferences(a,{...a,speed:.1,inletSpeed:.1}),[]);
  const angled={...a,shape:'streamlined',experiment:'angle'};
  assert.deepEqual(comparisonDifferences(angled,{...angled,angle:20,obstacleHeight:40}),[]);
  assert.ok(comparisonDifferences(a,{...a,shape:'block',speed:.1,inletSpeed:.1}).includes('shape'));
});

// Exercise the real application handlers with a small DOM and asynchronous
// Worker protocol double; no browser, GPU adapter or changed solver is required.
function appHarness(engine='webgpu'){
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const draw=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:t=>({width:t.length*9})},{get:(o,k)=>o[k]??(()=>{})});
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.checked=false;this.value='';this.textContent='';this.children=[];this.listeners={};this.attributes={};this.options=[];this.classList={toggle(){}};this.width=1200;this.height=520;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    fire(type,event={}){if(this.disabled&&type==='click')return;for(const fn of this.listeners[type]??[])fn({button:0,preventDefault(){},...event});}
    setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
    get selectedIndex(){return this.options.findIndex(o=>o.value===this.value);}
    querySelector(){return this.child??=new Element('span');}
    append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}remove(){}
    focus(){document.activeElement=this;}scrollIntoView(){}getContext(){return draw;}toDataURL(){return 'data:image/png;base64,test';}
    getBoundingClientRect(){return {left:0,top:0,width:1200,height:520};}
  }
  const elements=[],ids=new Map();
  for(const match of html.matchAll(/<([\w-]+)\b([^>]*)>/g)){
    const el=new Element(match[1]),attrs=match[2];
    for(const [key,val]of [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])){
      el.attributes[key]=val;if(key==='id')ids.set(val,el);
      if(key==='value')el.value=val;if(key.startsWith('data-'))el.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;
    }
    el.checked=/\bchecked\b/.test(attrs);el.disabled=/\bdisabled\b/.test(attrs);el.hidden=/\bhidden\b/.test(attrs);elements.push(el);
  }
  for(const [id,el]of ids)if(el.tagName==='SELECT'){
    const body=html.match(new RegExp('<select[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</select>'))?.[1]||'';
    el.options=[...body.matchAll(/<option\b([^>]*)>(.*?)<\/option>/g)].map(m=>({value:m[1].match(/value="([^"]*)"/)?.[1]??m[2],textContent:m[2],selected:/selected/.test(m[1])}));
    el.value=(el.options.find(o=>o.selected)??el.options[0])?.value??'';
  }
  const query=selector=>selector.split(',').flatMap(s=>s[0]==='#'?[ids.get(s.slice(1))].filter(Boolean):s.startsWith('[data-')?elements.filter(el=>{
    const m=s.match(/\[data-([\w-]+)(?:="([^"]*)")?\]/);return m&&Object.hasOwn(el.dataset,m[1])&&(m[2]===undefined||el.dataset[m[1]]===m[2]);
  }):[]);
  const document={hidden:false,body:new Element('body'),activeElement:null,getElementById:id=>ids.get(id)??null,
    createElement:tag=>new Element(tag),querySelectorAll:query,querySelector:()=>null,addEventListener(){}};
  const workers=[];let now=1;
  class Worker{
    constructor(){this.messages=[];workers.push(this);}
    postMessage(m){this.messages.push(m);if(m.type==='reset'){this.time=0;this.revision=m.revision;this.speed=m.speed;}}
    terminate(){this.terminated=true;}
    ready(){this.onmessage({data:{type:'ready',forceOptIn:true}});}
    respond(steps){const request=this.messages.filter(m=>m.type==='step').at(-1);this.time+=steps;
      const n=168*72;this.onmessage({data:{type:'frame',requestId:request.requestId,revision:this.revision,
        time:this.time,steps,inletSpeed:this.speed,forceX:0,forceY:0,fields:{rho:new Float32Array(n).fill(1),ux:new Float32Array(n).fill(this.speed),uy:new Float32Array(n)}}});
    }
  }
  const context=vm.createContext({FluidSimulation,EXTRA_SHAPES,shapePreview,makeAdaptiveStepper,STEP_FIXED,MAX_TRACER_DEBT,createGpuPaintPacer,forceFrameTiming,createStabilityRecorder,STABILITY_BUILD,createMatchedComparison,comparisonDifferences,seededRandom,
    document,navigator:{gpu:{}},location:{pathname:'/airflow-lab/',search:'?quality=fast&engine='+engine,href:'https://example.test/airflow-lab/'},
    window:{addEventListener(){}},innerWidth:1200,matchMedia:()=>({matches:false}),Worker,WebAssembly,URL,URLSearchParams,
    performance:{now:()=>now++},Float32Array,Float64Array,Uint8ClampedArray,Math,Date,structuredClone,AbortController,
    requestAnimationFrame(){},setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},console});
  const source=readFileSync(new URL('./app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'https://example.test/airflow-lab/app.mjs'");
  vm.runInContext(source,context);
  return {ids,workers,run:s=>vm.runInContext(s,context),click:id=>ids.get(id).fire('click'),state:()=>structuredClone(vm.runInContext('({phase:comparison.phase,active:comparison.active,running,steps:sim.time,shape:sim.shape,captures:captures.map(({image,...r})=>r)})',context))};
}
test('application captures exactly matched Worker frames, locks controls and restores free exploration',()=>{
  const app=appHarness();app.workers[0].ready();app.ids.get('prediction').value='b';app.click('startComparison');
  assert.equal(app.state().phase,'running-a');assert.equal(app.ids.get('speed').disabled,true);
  const worker=app.workers[0];
  for(const shape of ['block','streamlined']){
    while(app.state().phase=== (shape==='block'?'running-a':'running-b')){
      app.run('publishRustStep(24,Infinity,performance.now())');
      const count=worker.messages.filter(m=>m.type==='step').at(-1).count;
      assert.ok(count>0&&count<=24);worker.respond(count);
    }
    if(shape==='block'){
      assert.equal(app.ids.get('playButton').disabled,true);
      assert.equal(app.state().captures[0].steps,2000);
      app.click('nextComparison');
    }
  }
  const state=app.state();assert.equal(state.phase,'done');assert.equal(state.running,false);
  assert.equal(state.captures.length,2);assert.equal(state.captures[1].steps,2000);
  assert.deepEqual(comparisonDifferences(...state.captures),[]);
  assert.equal(app.ids.get('speed').disabled,false);assert.equal(app.ids.get('engine').disabled,false);
  assert.equal(app.ids.get('exportComparison').disabled,false);
  assert.match(app.ids.get('fairTestStatus').textContent,/Matched conditions/);
});
test('JavaScript path limits the last chunk and automatically captures at the shared point',()=>{
  const app=appHarness('javascript');app.ids.get('prediction').value='unsure';app.click('startComparison');
  const completed=app.run('sim.time=1997;runSteps(24,Infinity)');
  assert.equal(completed,3);app.run('finishComparisonTrial()');
  assert.equal(app.state().phase,'ready-b');assert.equal(app.state().captures[0].steps,2000);
  app.click('cancelComparison');assert.equal(app.state().active,false);assert.equal(app.ids.get('playButton').disabled,false);
  const previous=app.run('sim.centerX');app.ids.get('tunnel').fire('keydown',{key:'ArrowRight'});
  assert.equal(app.run('sim.centerX'),previous+1);assert.equal(app.state().steps,0);
});
test('an engine failure ends the guided run without labeling the mixed result as completed',()=>{
  const app=appHarness();app.workers[0].ready();app.ids.get('prediction').value='a';app.click('startComparison');
  app.workers[0].onmessage({data:{type:'error',message:'device lost'}});
  assert.equal(app.state().phase,'cancelled');assert.equal(app.state().captures.length,0);
  assert.equal(app.ids.get('speed').disabled,false);assert.match(app.ids.get('comparisonStatus').textContent,/engine changed/);
});
test('a prediction is required and keyboard/drag guards protect the matched run',()=>{
  const app=appHarness('javascript');app.click('startComparison');assert.equal(app.state().phase,'idle');
  app.ids.get('prediction').value='unsure';app.click('startComparison');
  const before=app.run('sim.centerX');
  app.ids.get('tunnel').fire('keydown',{key:'ArrowRight'});
  app.ids.get('tunnel').fire('pointerdown',{pointerId:1,clientX:400,clientY:250});
  assert.equal(app.run('sim.centerX'),before);assert.equal(app.run('pointer'),null);
});
