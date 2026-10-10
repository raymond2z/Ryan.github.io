import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {FluidSimulation} from './simulation.mjs';
import {EXTRA_SHAPES,shapePreview} from './shapes.mjs';
import {makeAdaptiveStepper,STEP_FIXED,MAX_TRACER_DEBT,createGpuPaintPacer,forceFrameTiming} from './live-performance.mjs';
import {createStabilityRecorder,STABILITY_BUILD} from './stability-recorder.mjs';
import {createMatchedComparison,comparisonPlan,comparisonDifferences,setComparisonShape,COMPARISON_SHAPES,seededRandom} from './shape-comparison.mjs';
import {learningChecks,makeLearningRecord} from './learning-record.mjs';
import {GPU_EXPERIMENT_BUILD,GPU_PROFILES,experimentSettings,createGpuRequestPacer,createGpuLoadGovernor} from './gpu-experiment.mjs';

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
      setComparisonShape(sim,plan,shape);const b=sim.obstacleBounds();
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
function appHarness(engine='webgpu',{path='/airflow-lab/',search='',page='index.html'}={}){
  const html=readFileSync(new URL('./'+page,import.meta.url),'utf8');
  const drawCalls=[],blobs=[];let rasters=0;
  const draw=new Proxy({putImageData:()=>rasters++,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:t=>({width:t.length*9}),fillText:t=>drawCalls.push(t)},{get:(o,k)=>o[k]??(()=>{})});
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.checked=false;this.value='';this.textContent='';this.children=[];this.listeners={};this.attributes={};this.options=[];this.classList={toggle(){}};this.width=1200;this.height=520;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    click(){this.fire('click');}
    fire(type,event={}){if(this.disabled&&type==='click')return;for(const fn of this.listeners[type]??[])fn({button:0,preventDefault(){},...event});}
    setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}
    get selectedIndex(){return this.options.findIndex(o=>o.value===this.value);}
    querySelector(){return this.child??=new Element('span');}
    append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}remove(){}
    focus(){document.activeElement=this;}scrollIntoView(){}getContext(){return draw;}toDataURL(){return 'data:image/png;base64,test';}
    toBlob(callback){callback(new Blob(['test'],{type:'image/png'}));}
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
        time:this.time,steps,inletSpeed:this.speed,forceX:0,forceY:0,perf:{workerMs:2,encodeMs:.5,queueReadbackMs:1,unpackMs:.5,forceEnabled:false},fields:{rho:new Float32Array(n).fill(1),ux:new Float32Array(n).fill(this.speed),uy:new Float32Array(n)}}});
    }
  }
  class Image{set src(value){this.onload();}}
  class TestURL extends URL{static createObjectURL(blob){blobs.push(blob);return 'blob:test';}static revokeObjectURL(){}}
  const context=vm.createContext({FluidSimulation,EXTRA_SHAPES,shapePreview,makeAdaptiveStepper,STEP_FIXED,MAX_TRACER_DEBT,createGpuPaintPacer,forceFrameTiming,createStabilityRecorder,STABILITY_BUILD,createMatchedComparison,comparisonDifferences,setComparisonShape,seededRandom,learningChecks,makeLearningRecord,GPU_EXPERIMENT_BUILD,GPU_PROFILES,experimentSettings,createGpuRequestPacer,createGpuLoadGovernor,
    document,navigator:{gpu:{}},location:{pathname:path,search:'?quality=fast&engine='+engine+search,href:'https://example.test'+path},
    window:{addEventListener(){}},innerWidth:1200,matchMedia:()=>({matches:false}),Worker,WebAssembly,URL:TestURL,URLSearchParams,Image,Blob,
    performance:{now:()=>now++},Float32Array,Float64Array,Uint8ClampedArray,Math,Date,structuredClone,AbortController,
    requestAnimationFrame(){},setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},console});
  const source=readFileSync(new URL('./app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'https://example.test/airflow-lab/app.mjs'");
  vm.runInContext(source,context);
  return {ids,workers,drawCalls,blobs,rasterCount:()=>rasters,setClock:value=>now=value,run:s=>vm.runInContext(s,context),click:id=>ids.get(id).fire('click'),state:()=>structuredClone(vm.runInContext('({phase:comparison.phase,active:comparison.active,running,steps:sim.time,shape:sim.shape,captures:captures.map(({image,...r})=>r)})',context))};
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

test('all selectable pairs fit both grids and have genuinely matched raster heights',()=>{
  for(const [width,height]of [[240,104],[168,72]]){
    for(let i=0;i<COMPARISON_SHAPES.length;i++)for(let j=i+1;j<COMPARISON_SHAPES.length;j++){
      for(const position of [{x:0,y:0},{x:width-1,y:height-1}]){
        const pair=[COMPARISON_SHAPES[i],COMPARISON_SHAPES[j]],plan=comparisonPlan({...settings,grid:{width,height},position,pair});
        const sim=new FluidSimulation(width,height),heights=[];
        for(const shape of pair){
          const baseScale=sim.shapeScale;setComparisonShape(sim,plan,shape);const b=sim.obstacleBounds();
          assert.equal(sim.shapeScale,baseScale,'Normal preset scale must be restored');
          assert.ok(b.minX>=8&&b.maxX<=width-9&&b.minY>=8&&b.maxY<=height-9);
          assert.ok(Math.abs((b.minX+b.maxX)/2-plan.position.x)<=.5);
          assert.ok(Math.abs((b.minY+b.maxY)/2-plan.position.y)<=.5);
          heights.push(b.maxY-b.minY+1);assert.equal(sim.time,0);
        }
        assert.ok(Math.abs(heights[0]-heights[1])<=1,`Height mismatch ${pair} on ${width}`);
      }
    }
  }
});
test('original-size comparisons preserve scale and warn about different frontal heights',()=>{
  const sim=new FluidSimulation(240,104),plan=comparisonPlan({...settings,pair:['car','pikachu'],matchHeight:false});
  const records=plan.pair.map(shape=>{
    const appearance=setComparisonShape(sim,plan,shape),b=sim.obstacleBounds();
    assert.equal(appearance.scale,1);
    return {...settings,shape,angle:0,steps:2000,obstacleHeight:b.maxY-b.minY+1,sizeMode:appearance.sizeMode};
  });
  assert.ok(comparisonDifferences(...records).includes('front-facing height'));
  assert.throws(()=>comparisonPlan({...settings,pair:['car','car']}));
  assert.throws(()=>comparisonPlan({...settings,pair:['custom','bird']}));
});
function finishWorkerTrial(app){
  const worker=app.workers[0];
  while(app.state().active&&app.state().phase!=='ready-b'){
    app.run('publishRustStep(24,Infinity,performance.now())');
    worker.respond(worker.messages.filter(m=>m.type==='step').at(-1).count);
  }
}
function finishWorkerPair(app){finishWorkerTrial(app);app.click('nextComparison');finishWorkerTrial(app);}
test('chosen silhouettes and prediction follow the pair while duplicate choices are blocked',()=>{
  const app=appHarness();app.workers[0].ready();
  app.ids.get('comparisonShapeA').value='car';app.ids.get('comparisonShapeB').value='bird';
  app.ids.get('comparisonShapeA').fire('change');
  assert.match(app.ids.get('prediction').options[1].textContent,/Car/);assert.match(app.ids.get('nextComparison').textContent,/Bird/);
  app.ids.get('prediction').value='b';app.click('startComparison');
  assert.equal(app.ids.get('comparisonShapeA').disabled,true);assert.equal(app.ids.get('matchShapeHeight').disabled,true);
  finishWorkerPair(app);const records=app.state().captures;
  assert.deepEqual(records.map(r=>r.shape),['car','bird']);
  assert.ok(records.every(r=>r.comparison.prediction==='Bird has the narrower wake'));
  assert.deepEqual(comparisonDifferences(...records),[]);
  app.run('captures=[];renderCaptures()');app.ids.get('comparisonShapeB').value='car';app.ids.get('comparisonShapeB').fire('change');
  assert.equal(app.ids.get('startComparison').disabled,true);
});
test('repeating restores original conditions and retains previous notes without growing history',async()=>{
  const app=appHarness();app.workers[0].ready();
  app.ids.get('comparisonShapeA').value='car';app.ids.get('comparisonShapeB').value='pikachu';app.ids.get('comparisonShapeA').fire('change');
  app.ids.get('prediction').value='a';app.click('startComparison');finishWorkerPair(app);
  app.run("captures[0].note='A wide wake';captures[1].note='Small swirls';");app.ids.get('conclusion').value='My first explanation';
  const first=app.state().captures;
  // Change freely after completion, then ask to repeat the ORIGINAL test.
  app.run('sim.speed=.15;sim.viscosity=.08;');app.ids.get('animation').value='24';app.ids.get('batchMode').value='adaptive';
  app.ids.get('comparisonShapeA').value='bird';app.ids.get('comparisonShapeB').value='plate';app.ids.get('matchShapeHeight').checked=false;
  app.click('repeatComparison');
  assert.equal(app.ids.get('comparisonShapeA').value,'car');assert.equal(app.ids.get('comparisonShapeB').value,'pikachu');
  assert.equal(app.ids.get('matchShapeHeight').checked,true);assert.equal(app.ids.get('animation').value,'7');assert.equal(app.ids.get('batchMode').value,'fixed');
  assert.equal(app.run('sim.speed'),first[0].speed);assert.equal(app.run('sim.viscosity'),first[0].viscosity);
  assert.equal(app.run('previousComparison.captures[0].note'),'A wide wake');
  assert.equal(app.run('previousComparison.conclusion'),'My first explanation');
  finishWorkerPair(app);assert.equal(app.state().captures[0].comparison.round,2);assert.equal(app.ids.get('repeatReflection').hidden,false);
  assert.deepEqual(app.state().captures.map(r=>r.position),first.map(r=>r.position));
  app.ids.get('repeatResult').value='similar';app.ids.get('conclusion').value='My second explanation';
  await app.run('exportReport(previousComparison.captures,previousComparison)');
  assert.ok(app.drawCalls.some(t=>t==='Explanation: My first explanation'));
  await app.run('exportReport()');assert.ok(app.drawCalls.some(t=>/Round 2: The wake looked similar/.test(t)));
  app.click('repeatComparison');
  assert.equal(app.run('previousComparison.round'),2);assert.equal(app.run('previousComparison.captures.length'),2);
  assert.equal(app.run('previousComparison.repeatResult'),'similar');
  app.click('cancelComparison');assert.equal(app.run('previousComparison.conclusion'),'My second explanation');
});

test('learning record follows written evidence and invalidates review after a view changes',()=>{
  const app=appHarness();app.workers[0].ready();app.ids.get('prediction').value='unsure';app.click('startComparison');finishWorkerPair(app);
  const list=()=>app.ids.get('learningChecks').children;
  assert.equal(app.ids.get('learningProgress').hidden,false);
  assert.equal(app.ids.get('exportLearningRecord').disabled,false,'Incomplete writing can still be saved');
  assert.match(app.ids.get('learningNext').textContent,/Describe/);
  const notes=app.ids.get('captures').children.map(figure=>figure.children[1].children.find(el=>el.tagName==='LABEL').children[0]);
  notes[0].value='A: blue wake';notes[0].fire('input');notes[1].value='B: short wake';notes[1].fire('input');
  app.ids.get('fairReviewed').checked=true;app.ids.get('fairReviewed').fire('change');
  app.ids.get('conclusion').value='I need more testing because the colours are hard to compare.';app.ids.get('conclusion').fire('input');
  assert.ok(list().every(el=>el.dataset.done==='true'));
  assert.match(app.ids.get('learningNext').textContent,/writing is recorded/);
  app.run('selectExperiment("speed")');
  assert.match(app.ids.get('conclusion').value,/more testing/,'Planning another question does not erase saved work');
  const remove=app.ids.get('captures').children[1].children[1].children[0].children[1];remove.click();
  assert.equal(app.ids.get('fairReviewed').checked,false);assert.equal(app.ids.get('fairReviewed').disabled,true);
  assert.equal(app.ids.get('exportLearningRecord').disabled,true);
});

test('full downloaded record includes the previous round with its own review and explanation',async()=>{
  const app=appHarness();app.workers[0].ready();app.ids.get('prediction').value='a';app.click('startComparison');finishWorkerPair(app);
  app.run("captures[0].note='FIRST-A';captures[1].note='FIRST-B';");app.ids.get('conclusion').value='FIRST-EXPLANATION';app.ids.get('fairReviewed').checked=true;
  app.click('repeatComparison');assert.equal(app.ids.get('fairReviewed').checked,false);finishWorkerPair(app);
  app.run("captures[0].note='SECOND-A';captures[1].note='SECOND-B';");app.ids.get('conclusion').value='SECOND-EXPLANATION';app.ids.get('repeatResult').value='unsure';app.ids.get('repeatResult').fire('change');
  assert.equal(app.ids.get('learningChecks').children.at(-1).dataset.done,'true');
  app.click('exportLearningRecord');const report=await app.blobs.at(-1).text();
  for(const word of ['FIRST-A','FIRST-B','FIRST-EXPLANATION','SECOND-A','SECOND-B','SECOND-EXPLANATION','Previous test','Student marked settings reviewed.','Student has not marked settings reviewed.'])assert.ok(report.includes(word),word);
  app.run('exportLearningRecord(previousComparison.captures,previousComparison)');const previous=await app.blobs.at(-1).text();
  assert.ok(previous.includes('FIRST-EXPLANATION'));assert.ok(!previous.includes('SECOND-EXPLANATION'));
  app.click('repeatComparison');assert.equal(app.run('previousComparison.fairReviewed'),false);
});

test('manual captures retain the prediction from A after editing planning controls',async()=>{
  const app=appHarness('javascript');app.ids.get('prediction').value='unsure';app.click('captureButton');
  app.ids.get('prediction').value='a';app.click('captureButton');
  assert.ok(app.state().captures.every(r=>r.prediction==="I'm not sure yet"));
  app.click('exportLearningRecord');const report=await app.blobs.at(-1).text();
  assert.ok(report.includes('I&#39;m not sure yet'));assert.ok(!report.includes('Block has the narrower wake'));
  await app.run('exportReport()');assert.ok(app.drawCalls.includes("Prediction: I'm not sure yet"));
});

test('classroom query strings cannot activate GPU experiments or double student simulation demand',()=>{
  const app=appHarness('webgpu',{search:'&profile=flow60&pace=2'});app.workers[0].ready();
  assert.equal(app.ids.get('gpuExperimentPanel').hidden,true);
  assert.equal(app.run('experimentConfiguration().enabled'),false);
  assert.equal(app.run('flowPaceMultiplier'),1);assert.equal(app.ids.get('batchMode').value,'fixed');
});

test('actual experiment frame loop separates 60 paints from 30 new fields and never queues extra steps',()=>{
  const app=appHarness('webgpu',{path:'/airflow-lab/performance.html',page:'performance.html',search:'&profile=display60&pace=2'});
  app.workers[0].ready();app.ids.get('animation').value='24';
  const worker=app.workers[0];
  const initialRasters=app.rasterCount();
  app.run('paintedFrames=0;windowGpuSnapshots=0;gpuFluidDirty=false;gpuParticleDebt=0;');
  for(let i=1;i<=120;i++){
    const time=i*1000/60;app.setClock(time);app.run(`frame(${time})`);
    const request=worker.messages.filter(m=>m.type==='step').at(-1);
    if(app.run('workerInFlight')){
      const before=worker.messages.filter(m=>m.type==='step').length;
      app.run(`frame(${time}+1)`);
      assert.equal(worker.messages.filter(m=>m.type==='step').length,before,'busy Worker cannot receive another step request');
      worker.respond(request.count);
    }
  }
  const requests=worker.messages.filter(m=>m.type==='step');
  assert.ok(requests.length>=58&&requests.length<=62);
  assert.ok(app.run('lastCanvasFps')>50);assert.ok(app.run('lastSnapshotHz')>25&&app.run('lastSnapshotHz')<35);
  assert.ok(app.rasterCount()-initialRasters>=55&&app.rasterCount()-initialRasters<=65,'60 paint / 30 field mode must rasterize only fresh fields');
  assert.ok(app.run('lastReusedPaintHz')>15,'intermediate paints reuse the field raster');
  assert.ok(requests.every(r=>r.count<=8));
  app.ids.get('gpuProfile').value='flow60';app.ids.get('gpuProfile').fire('change');
  const start=requests.length;
  for(let i=121;i<=180;i++){const time=i*1000/60;app.setClock(time);app.run(`frame(${time})`);if(app.run('workerInFlight'))worker.respond(worker.messages.filter(m=>m.type==='step').at(-1).count);}
  const newer=worker.messages.filter(m=>m.type==='step').length-start;assert.ok(newer>=58&&newer<=62,`60-flow requests: ${newer}`);
});

test('research comparisons lock profile and demand, restore them on repeat and still capture exactly 2000 steps',()=>{
  const app=appHarness('webgpu',{path:'/airflow-lab/performance.html',page:'performance.html',search:'&profile=auto60&pace=2'});
  app.workers[0].ready();app.ids.get('prediction').value='unsure';app.click('startComparison');
  assert.equal(app.ids.get('gpuProfile').disabled,true);assert.equal(app.ids.get('gpuDemand').disabled,true);finishWorkerPair(app);
  assert.deepEqual(app.state().captures.map(r=>r.steps),[2000,2000]);
  app.ids.get('gpuProfile').value='baseline';app.ids.get('gpuDemand').value='1';app.ids.get('gpuProfile').fire('change');app.click('repeatComparison');
  assert.equal(app.ids.get('gpuProfile').value,'auto60');assert.equal(app.ids.get('gpuDemand').value,'2');finishWorkerPair(app);
  assert.deepEqual(comparisonDifferences(...app.state().captures),[]);
  assert.equal(app.state().captures[0].performanceExperiment.profile,'auto60');
});

test('research controller settings are disabled during recording and GPU fallback leaves the experiment inactive',()=>{
  const app=appHarness('webgpu',{path:'/airflow-lab/performance.html',page:'performance.html',search:'&profile=flow60&pace=2'});
  app.workers[0].ready();app.click('startStability');assert.equal(app.ids.get('gpuProfile').disabled,true);assert.equal(app.ids.get('gpuDemand').disabled,true);
  app.click('stopStability');assert.equal(app.ids.get('gpuProfile').disabled,false);
  app.workers[0].onmessage({data:{type:'error',message:'device lost'}});
  app.run('refreshPerformance()');assert.match(app.ids.get('gpuExperimentStatus').textContent,/inactive/);
  assert.equal(app.run('engineKind'),'wasm');
});
