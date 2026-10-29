(function(global){
'use strict';
const G=9.81,RHO=1.225;
const defaults={mass:83,wheels:10,inertia:.5,radius:15,crr:.012,axle:.08,cda:8,seam:1,v0:0,tilt:0,restitution:.12,landing:.96};
const specs=[
 {key:'mass',label:'Total car mass',unit:'g',min:50,max:220,step:1,group:'car',hint:'Includes the body and all wheels. Mass changes how strongly a given resistance slows the car.'},
 {key:'wheels',label:'Total wheel mass',unit:'g',min:2,max:24,step:.5,group:'car',hint:'Combined mass of all four wheels. Heavier wheels need more energy to spin.'},
 {key:'radius',label:'Wheel radius',unit:'mm',min:8,max:25,step:.5,group:'car',hint:'Changes the visible wheels, wheel-center path, and equivalent axle-friction force.'},
 {key:'inertia',label:'Wheel inertia factor',unit:'',min:.3,max:1,step:.05,group:'car',hint:'I = k·m·r². Use 0.5 for a uniform disc or 1 for a thin ring.'},
 {key:'crr',label:'Rolling resistance',unit:'',min:0,max:.08,step:.001,group:'loss',hint:'Equivalent wheel-surface resistance. It varies with normal force through curves.'},
 {key:'axle',label:'Total axle friction torque',unit:'mN·m',min:0,max:1,step:.01,group:'loss',hint:'Total friction torque across all axles, divided by wheel radius to obtain resistance.'},
 {key:'cda',label:'Drag area CdA',unit:'cm²',min:0,max:30,step:.5,group:'loss',hint:'Drag coefficient × frontal area. Air density is set to 1.225 kg/m³.'},
 {key:'seam',label:'Energy loss per joint',unit:'%',min:0,max:15,step:.5,group:'loss',hint:'Fraction of rolling kinetic energy lost when crossing each joint in contact.'},
 {key:'v0',label:'Starting speed',unit:'m/s',min:0,max:4,step:.05,group:'track',hint:'Zero releases the car from rest. Higher values represent an initial push.'},
 {key:'tilt',label:'Track tilt',unit:'°',min:-10,max:10,step:.2,group:'track',hint:'Rotates the entire track about the start. Positive values raise the finish.'},
 {key:'restitution',label:'Landing restitution',unit:'',min:0,max:.6,step:.02,group:'track',hint:'Fraction of normal speed retained in a bounce. Zero gives no rebound; calibrate with real runs.'},
 {key:'landing',label:'Landing speed retained',unit:'%',min:70,max:100,step:1,group:'track',hint:'Fraction of tangential speed retained after landing. A simplified collision parameter.',percent:true}
];
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function sanitize(raw){const p={...defaults};for(const d of specs){const v=Number(raw?.[d.key]);if(Number.isFinite(v))p[d.key]=clamp(v,d.percent?d.min/100:d.min,d.percent?d.max/100:d.max);}return p;}
function makeTrack(data,p){
 const angle=p.tilt*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle),r=p.radius/1000;
 const base=data.points[0][1];
 const road=data.points.map(([x,z])=>({x:x*c-(z-base)*sn,z:x*sn+(z-base)*c,rawX:x}));
 // A 20 mm triangular kernel smooths mesh facets for the contact trajectory.
 // Linear extrapolation at the endpoints preserves the initial slope.
 function extrap(i,key){if(i<0)return road[0][key]+i*(road[1][key]-road[0][key]);if(i>=road.length){const n=road.length-1;return road[n][key]+(i-n)*(road[n][key]-road[n-1][key]);}return road[i][key];}
 const smooth=road.map((q,i)=>{let x=0,z=0,total=0;for(let j=-5;j<=5;j++){const weight=6-Math.abs(j);x+=weight*extrap(i+j,'x');z+=weight*extrap(i+j,'z');total+=weight;}return {...q,x:x/total,z:z/total};});
 for(let i=0;i<smooth.length;i++){const a=smooth[Math.max(0,i-1)],b=smooth[Math.min(smooth.length-1,i+1)];smooth[i].theta=Math.atan2(b.z-a.z,b.x-a.x);}
 const path=smooth.map(q=>({...q,x:q.x-r*Math.sin(q.theta),z:q.z+r*Math.cos(q.theta)}));
 for(let i=0;i<path.length;i++){path[i].s=i?path[i-1].s+Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z):0;}
 for(let i=0;i<path.length;i++){const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];path[i].theta=Math.atan2(b.z-a.z,b.x-a.x);}
 const angles=path.map(q=>q.theta);
 for(let i=0;i<path.length;i++){const a=Math.max(0,i-1),b=Math.min(path.length-1,i+1);path[i].k=(angles[b]-angles[a])/Math.max(1e-8,path[b].s-path[a].s);}
 const cuts=data.cuts.map(cut=>path.reduce((a,b)=>Math.abs(a.rawX-cut)<Math.abs(b.rawX-cut)?a:b).s);
 return {road,path,cuts,length:path.at(-1).s};
}
function lookup(arr,value,key='s'){
 let lo=0,hi=arr.length-1;if(value<=arr[lo][key])return {...arr[lo]};if(value>=arr[hi][key])return {...arr[hi]};
 while(hi-lo>1){let mid=(lo+hi)>>1;if(arr[mid][key]<value)lo=mid;else hi=mid;}
 const a=arr[lo],b=arr[hi],f=(value-a[key])/(b[key]-a[key]);const q={};for(const k of Object.keys(a))q[k]=a[k]+(b[k]-a[k])*f;return q;
}
function simulate(data,raw,options={}){
 const p=sanitize(raw),track=makeTrack(data,p),m=p.mass/1000,me=m+p.inertia*p.wheels/1000,dt=options.dt||.001;
 let s=0,v=p.v0,t=0,q=lookup(track.path,0),x=q.x,z=q.z,vx=v*Math.cos(q.theta),vz=v*Math.sin(q.theta),ground=true;
 let peak=v,airTime=0,maxAir=0,airStart=0,flightCount=0,status='timeout',normal=1,angle=q.theta,seamIndex=0;
 const samples=[],events=[],flights=[];let activeFlight=null;
 const beginFlight=(at,cause)=>{activeFlight={start:at,s,x,z,speed:Math.hypot(vx,vz),maxHeight:0,cause};flightCount++;events.push({type:'takeoff',t:at,x,z,s,cause});};
 const endFlight=(at,impact=null)=>{if(activeFlight){flights.push({...activeFlight,end:at,duration:Math.max(0,at-activeFlight.start),impact,landed:impact!==null});activeFlight=null;}};
 const capture=()=>samples.push({t,x,z,s,v:ground?v:Math.hypot(vx,vz),angle,ground,normal});
 capture();
 for(let step=0;step<Math.ceil(20/dt);step++){
   const oldX=x,oldZ=z,oldS=s;
   if(ground){
     q=lookup(track.path,s);normal=Math.cos(q.theta)+v*v*q.k/G;
     if(normal<0&&v>.05){ground=false;vx=v*Math.cos(q.theta);vz=v*Math.sin(q.theta);airStart=t;beginFlight(t,'takeoff');}
   }
   if(ground){
     const resistance=p.crr*m*G*Math.max(0,normal)+p.axle*.001/(p.radius/1000)+.5*RHO*p.cda*.0001*v*v;
     const acceleration=(-m*G*Math.sin(q.theta)-resistance)/me;
     const next=v+acceleration*dt;
     if(next<=0&&acceleration<=0){status='stalled';events.push({type:'stall',t,x,z,s});break;}
     const vn=Math.max(0,next);s+=(v+vn)*.5*dt;v=vn;
     while(seamIndex<track.cuts.length&&s>=track.cuts[seamIndex]){if(oldS<track.cuts[seamIndex])v*=Math.sqrt(1-p.seam/100);seamIndex++;}
     q=lookup(track.path,s);x=q.x;z=q.z;angle=q.theta;vx=v*Math.cos(angle);vz=v*Math.sin(angle);
   }else{
     const speed=Math.hypot(vx,vz),drag=.5*RHO*p.cda*.0001*speed/m;
     const ax=-drag*vx,az=-G-drag*vz;
     x+=vx*dt+.5*ax*dt*dt;z+=vz*dt+.5*az*dt*dt;vx+=ax*dt;vz+=az*dt;v=Math.hypot(vx,vz);airTime+=dt;normal=0;
     // Orientation is illustrative; pitching inertia is outside this model.
     angle+=clamp(Math.atan2(vz,vx)-angle,-dt*2,dt*2);
     q=lookup(track.path,x,'x');s=q.s;maxAir=Math.max(maxAir,z-q.z);if(activeFlight)activeFlight.maxHeight=Math.max(activeFlight.maxHeight,z-q.z);
     if(x<=track.path.at(-1).x&&z<=q.z&&vx>0){
       const ct=Math.cos(q.theta),st=Math.sin(q.theta),vn=-vx*st+vz*ct;
       if(vn<0){
         const tangential=Math.max(0,(vx*ct+vz*st)*p.landing),bounce=-vn*p.restitution;
         events.push({type:'landing',t:t+dt,x,z:q.z,s,impact:-vn,airDuration:t+dt-airStart});
         endFlight(t+dt,-vn);
         x=q.x;z=q.z;v=tangential;angle=q.theta;
         if(bounce>.08){vx=tangential*ct-bounce*st;vz=tangential*st+bounce*ct;z+=.00005;airStart=t+dt;beginFlight(t+dt,'rebound');}
         else{ground=true;normal=Math.max(0,Math.cos(angle)+v*v*q.k/G);vx=v*ct;vz=v*st;}
         while(seamIndex<track.cuts.length&&track.cuts[seamIndex]<=s)seamIndex++;
       }
     }
     if(x<track.path[0].x-.05||vx<0||z<Math.min(...[track.path[0].z,track.path.at(-1).z])-1){status='offtrack';break;}
   }
   t+=dt;peak=Math.max(peak,v);
   if(step%5===0)capture();
   if(s>=track.length-1e-7||x>=track.path.at(-1).x){
     // Resolve last-step time to the end plane instead of retaining dt overshoot.
     const dx=x-oldX,remaining=track.path.at(-1).x-oldX;
     if(dx>0&&remaining>=0&&remaining<dx){const f=remaining/dx;t-=dt*(1-f);x=oldX+f*dx;z=oldZ+f*(z-oldZ);}
     s=track.length;status=ground?'finished':'airborne-finish';break;
   }
 }
 endFlight(t);capture();
 return {p,track,samples,events,flights,status,time:t,peak,airTime,maxAir,flightCount,finished:status==='finished'||status==='airborne-finish',distance:clamp(s,0,track.length)};
}
function sampleAt(run,t){return lookup(run.samples,clamp(t,0,run.time),'t');}
const api={defaults,specs,sanitize,makeTrack,simulate,sampleAt,lookup};global.DerbyPhysics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
