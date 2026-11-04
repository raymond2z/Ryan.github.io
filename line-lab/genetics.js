import {Simulation,DT,clamp,MOTOR_SCALE} from './engine.js?v=5';
export const GENES=[{key:'kp',label:'P',min:2,max:55,step:8},{key:'ki',label:'I',min:0,max:8,step:1.5},{key:'kd',label:'D',min:0,max:10,step:1.5}];
export const TEST_SECONDS=12;
export const GA_DEFAULTS={track:'curves',base:80,bias:0,population:12,mutation:0.2,seed:42};
export function seededRandom(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const rounded=v=>Math.round(v*100)/100;
export function randomGenome(random){return Object.fromEntries(GENES.map(g=>[g.key,rounded(g.min+random()*(g.max-g.min))]));}
export function evaluateGenome(genome,config){
 const sim=new Simulation({...config,...genome,mode:'pid'}),steps=Math.round(TEST_SECONDS/DT);
 let centered=0;const route=[{t:0,x:sim.car.x,y:sim.car.y,angle:sim.car.angle,distance:0}];
 for(let i=0;i<steps;i++){sim.tick();if(sim.visible&&!sim.finished)centered+=1-Math.min(2,Math.abs(sim.error))/2;if(i%5===4||sim.finished||i===steps-1)route.push({t:sim.time,x:sim.car.x,y:sim.car.y,angle:sim.car.angle,distance:sim.distance});if(sim.finished)break;}
 const targetLaps=config.base*MOTOR_SCALE*TEST_SECONDS/sim.loopLength;
 const progress=clamp(Math.max(0,sim.travel/sim.path.length)/targetLaps,0,1);
 const seen=sim.seen/steps,centering=centered/steps;
 const parts={progress:60*progress,line:25*seen,centering:15*centering};
 return {score:parts.progress+parts.line+parts.centering,parts,route,loopLength:sim.loopLength,laps:sim.laps,progressLaps:Math.max(0,sim.travel/sim.path.length),seen:seen*100,error:sim.seen?sim.meanError:2,stopped:sim.finished};
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
  this.history.push({generation:this.generation,best:best.score,mean});
  return {generation:this.generation,population:this.population,history:this.history,config:this.config,best,mean};
 }
}
