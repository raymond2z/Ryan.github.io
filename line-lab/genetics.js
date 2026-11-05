import {Simulation,DT,clamp,nearest} from './engine.js?v=6';
export const GENES=[{key:'kp',label:'P',min:2,max:55,step:8},{key:'ki',label:'I',min:0,max:8,step:1.5},{key:'kd',label:'D',min:0,max:10,step:1.5},{key:'base',label:'Speed',min:35,max:100,step:16},{key:'slowdown',label:'Slow',min:0,max:.85,step:.2}];
export const TEST_SECONDS=12;
export const GA_DEFAULTS={track:'tight',base:80,bias:0,population:12,mutation:0.2,seed:42};
export function seededRandom(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const rounded=v=>Math.round(v*100)/100;
export function randomGenome(random){return Object.fromEntries(GENES.map(g=>[g.key,rounded(g.min+random()*(g.max-g.min))]));}
// Referee only: the controller has no access to these track coordinates.
export class RaceProgress {
 constructor(path){this.path=path;this.lengths=path.map((a,i)=>{const b=path[(i+1)%path.length];return Math.hypot(b.x-a.x,b.y-a.y)});this.offsets=[0];for(const length of this.lengths)this.offsets.push(this.offsets.at(-1)+length);this.length=this.offsets.at(-1);this.last=0;this.forward=0;this.gates=0;this.invalid=false;}
 update(x,y){
  const n=nearest(this.path,x,y),i=Math.floor(n.index),arc=this.offsets[i]+(n.index-i)*this.lengths[i];
  let delta=arc-this.last;if(delta < -this.length/2)delta+=this.length;if(delta>this.length/2)delta-=this.length;
  // At 100% motor power a car moves at most 9 units per control tick.
  // Reject off-course motion or projection jumps; no skipped checkpoints.
  if(n.d>35||Math.abs(delta)>22){this.invalid=true;return;}
  this.last=arc;this.forward+=delta;
  while(this.gates<24&&this.forward>=(this.gates+1)*this.length/24)this.gates++;
 }
 get progress(){return clamp(this.forward/this.length,0,1);}
 get complete(){return !this.invalid&&this.gates===24;}
}
export function evaluateGenome(genome,config){
 const sim=new Simulation({...config,...genome,mode:'pid'}),steps=Math.round(TEST_SECONDS/DT),race=new RaceProgress(sim.path);
 let reason='Time limit';
 const pose=()=>({t:sim.time,x:sim.car.x,y:sim.car.y,angle:sim.car.angle,distance:sim.distance,progress:race.progress,speed:sim.targetSpeed||0});
 const route=[pose()];
 for(let i=0;i<steps;i++){
  sim.tick();race.update(sim.car.x,sim.car.y);
  const end=race.complete||race.invalid||sim.finished||sim.lostFor>=.8||i===steps-1;
  if(i%5===4||end)route.push(pose());
  if(end){reason=race.complete?'Finished':race.invalid?'Off course':sim.finished||sim.lostFor>=.8?'Line lost':'Time limit';break;}
 }
 const completed=race.complete,lapTime=completed?sim.time:null;
 // Any valid finisher beats every unfinished run. Within finishers, lower time wins.
 const parts={progress:completed?60:49*race.progress,time:completed?40*(1-sim.time/TEST_SECONDS):0};
 return {score:parts.progress+parts.time,parts,route,loopLength:sim.loopLength,laps:completed?1:0,progressLaps:race.progress,seen:sim.seenPercent,error:sim.seen?sim.meanError:2,stopped:!completed,completed,lapTime,reason,checkpoints:race.gates};
}
export class Evolution {
 constructor(config={}){
  this.config={...GA_DEFAULTS,...config};this.config.population=Math.round(clamp(this.config.population,8,32));
  this.config.mutation=clamp(this.config.mutation,0,1);this.random=seededRandom(this.config.seed);this.generation=0;this.population=[];this.history=[];
  this.initial=Array.from({length:this.config.population},(_,i)=>({id:`G1-${String(i+1).padStart(2,'0')}`,genome:randomGenome(this.random),origin:'random',parents:[],mutations:[],sources:{}}));
 }
 select(){let best=this.population[Math.floor(this.random()*this.population.length)];for(let i=1;i<3;i++){const p=this.population[Math.floor(this.random()*this.population.length)];if(p.score>best.score)best=p;}return best;}
 breed(){
  const generation=this.generation+1,children=this.population.slice(0,2).map((parent,i)=>({id:`G${generation}-${String(i+1).padStart(2,'0')}`,genome:{...parent.genome},origin:'elite',parents:[parent.id],parentGenomes:[{...parent.genome}],mutations:[],sources:{}}));
  while(children.length<this.config.population){
   const a=this.select(),b=this.select(),genome={},mutations=[],sources={};
   for(const gene of GENES){const source=this.random()<.5?a:b;sources[gene.key]=source.id;let v=source.genome[gene.key];
    if(this.random()<this.config.mutation){const changed=rounded(clamp(v+(this.random()+this.random()+this.random()-1.5)*gene.step,gene.min,gene.max));if(changed!==v)mutations.push({gene:gene.key,before:v,after:changed});v=changed;}
    genome[gene.key]=v;
   }
   children.push({id:`G${generation}-${String(children.length+1).padStart(2,'0')}`,genome,origin:'child',parents:[a.id,b.id],parentGenomes:[{...a.genome},{...b.genome}],sources,mutations});
  }
  return children;
 }
 prepare(){
  if(!this.prepared)this.prepared=this.generation?this.breed():this.initial;
  return this.prepared;
 }
 step(progress=()=>{}){
  const candidates=this.prepare();this.prepared=null;
  this.population=candidates.map((candidate,i)=>{const tested={...candidate,...evaluateGenome(candidate.genome,this.config)};progress(i+1,candidates.length);return tested;}).sort((a,b)=>b.score-a.score);
  this.generation++;const best=this.population[0],mean=this.population.reduce((s,p)=>s+p.score,0)/this.population.length;
  this.history.push({generation:this.generation,best:best.score,mean,completed:this.population.filter(p=>p.completed).length,bestLap:best.lapTime,meanLap:this.population.some(p=>p.completed)?this.population.filter(p=>p.completed).reduce((n,p)=>n+p.lapTime,0)/this.population.filter(p=>p.completed).length:null});
  return {generation:this.generation,population:this.population,history:this.history,config:this.config,best,mean};
 }
}

