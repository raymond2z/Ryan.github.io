(function(global){
'use strict';
const P=global.DerbyPhysics||(typeof require==='function'?require('./physics.js'):null),F=global.DerbyFit||(typeof require==='function'?require('./fit.js'):null);
const defaults={cg:50,height:10,gyration:40};
const specs=[{key:'cg',label:'CG from rear axle',unit:'%',min:20,max:80,step:1},{key:'height',label:'CG above axle line',unit:'mm',min:0,max:30,step:1},{key:'gyration',label:'Pitch radius of gyration',unit:'mm',min:15,max:70,step:1}];
function sanitize(raw={}){return Object.fromEntries(specs.map(d=>[d.key,Number.isFinite(raw[d.key])?Math.max(d.min,Math.min(d.max,raw[d.key])):defaults[d.key]]));}
const cross=(x,z,nx,nz)=>x*nz-z*nx;
function transform(data,tilt){const a=tilt*Math.PI/180,c=Math.cos(a),s=Math.sin(a),z0=data.points[0][1];return {points:data.points.map(([x,z,g])=>[(x*c-(z-z0)*s)/1000,(x*s+(z-z0)*c)/1000]),guide:data.points.map(([x,z,g])=>[(x*c-(g-z0)*s)/1000,(x*s+(g-z0)*c)/1000])};}
function lower(points,x){let a=0,b=points.length-1;while(a<b){const m=(a+b)>>1;if(points[m][0]<x)a=m+1;else b=m;}return a;}
// A finite road: no support is extrapolated past either end.
function surface(points,x,r){if(x<points[0][0]||x>points.at(-1)[0])return null;let best=-Infinity,slope=0;const a=Math.max(0,lower(points,x-r)-1),b=lower(points,x+r);for(let i=a;i<Math.min(b+1,points.length-1);i++){const u=points[i],v=points[i+1],dx=v[0]-u[0];if(dx<1e-12)continue;const k=(v[1]-u[1])/dx,lo=Math.max(u[0],x-r),hi=Math.min(v[0],x+r);if(lo>hi)continue;const q=Math.max(lo,Math.min(hi,x+r*k/Math.hypot(1,k))),h=Math.sqrt(Math.max(1e-16,r*r-(q-x)**2)),z=u[1]+k*(q-u[0])+h;if(z>best){best=z;slope=(q-x)/h;}}const n=Math.hypot(1,slope);return {z:best,nx:-slope/n,nz:1/n,tx:1/n,tz:slope/n};}
function bodyGap(profiles,x,z,angle,length,offset){const c=Math.cos(angle),s=Math.sin(angle);let gap=Infinity;for(const points of [profiles.points,profiles.guide]){const a=Math.max(0,lower(points,x-length)-1),b=lower(points,x+length);for(let i=a;i<Math.min(b+1,points.length-1);i++){const u=points[i],v=points[i+1],ta=(u[0]-x)*c+(u[1]-z)*s,tb=(v[0]-x)*c+(v[1]-z)*s,na=-(u[0]-x)*s+(u[1]-z)*c,nb=-(v[0]-x)*s+(v[1]-z)*c;let lo=0,hi=1;if(Math.abs(tb-ta)<1e-12){if(Math.abs(ta)>length/2)continue;}else{const aa=(-length/2-ta)/(tb-ta),bb=(length/2-ta)/(tb-ta);lo=Math.max(0,Math.min(aa,bb));hi=Math.min(1,Math.max(aa,bb));if(lo>hi)continue;}gap=Math.min(gap,offset-na-lo*(nb-na),offset-na-hi*(nb-na));}}return gap;}
function simulate(data,raw,geometry,settings={},options={}){
 const p=P.sanitize(raw),g=F.validate(geometry),d=sanitize(settings),dt=options.dt||.0002;
 if(!(dt>=.000025&&dt<=.001))throw Error('Unsupported dynamics timestep.');
 const profiles=transform(data,p.tilt),r=p.radius/1000,m=p.mass/1000,I=m*(d.gyration/1000)**2,mw=p.inertia*p.wheels/2000,wb=g.wheelbase/1000,h=d.height/1000,f=d.cg/100;
 const centers=F.envelope(data,p.radius);let pose=null;
 for(let q=centers[0][0];q<centers.at(-1)[0]-g.wheelbase;q+=1){pose=F.pose(data,centers,g,p.radius,q);if(pose)break;}
 if(!pose)throw Error('No fully supported starting pose.');
 const tilt=p.tilt*Math.PI/180,c=Math.cos(tilt),sn=Math.sin(tilt),z0=data.points[0][1];
 let angle=pose.angle+tilt,x=(pose.x*c-(pose.z-z0)*sn)/1000,z=(pose.x*sn+(pose.z-z0)*c)/1000;
 let cx=x+(f-.5)*wb*Math.cos(angle)-h*Math.sin(angle),cz=z+(f-.5)*wb*Math.sin(angle)+h*Math.cos(angle),vx=p.v0*Math.cos(angle),vz=p.v0*Math.sin(angle),omega=0,t=0;
 const spin=[p.v0,p.v0],local=[-f*wb,(1-f)*wb],samples=[],events=[];let dissipated=0,status='timeout',contacts=[true,true],loads=[0,0],maxPenetration=0,peak=0,airTime=0,singleTime=0,impactPeak=0;
 const datum=Math.min(...profiles.points.map(q=>q[1]))-r,kinetic=()=>.5*m*(vx*vx+vz*vz)+.5*I*omega*omega+.5*mw*(spin[0]**2+spin[1]**2),initialEnergy=m*9.81*(cz-datum)+kinetic();
 function axle(j){const a=local[j]*Math.cos(angle)+h*Math.sin(angle),b=local[j]*Math.sin(angle)-h*Math.cos(angle);return {x:cx+a,z:cz+b,a,b};}
 function capture(){x=cx+(.5-f)*wb*Math.cos(angle)+h*Math.sin(angle);z=cz+(.5-f)*wb*Math.sin(angle)-h*Math.cos(angle);const potential=m*9.81*(cz-datum),translation=.5*m*(vx*vx+vz*vz),pitch=.5*I*omega*omega,wheel=.5*mw*(spin[0]**2+spin[1]**2);samples.push({t,x,z,cx,cz,vx,vz,v:Math.hypot(vx,vz),angle,omega,rear:+contacts[0],front:+contacts[1],rearLoad:loads[0],frontLoad:loads[1],potential,translation,pitch,wheel,kinetic:translation+pitch+wheel,dissipated,residual:initialEnergy-potential-translation-pitch-wheel-dissipated,gap:bodyGap(profiles,x,z,angle,g.length/1000,(g.clearance-p.radius)/1000)});}
 capture();
 // Sequential normal impulses and ideal rolling constraints. Wheel spin is an
 // independent rim-speed degree of freedom per axle (half the wheel inertia).
 for(let step=0;step<Math.ceil((options.duration||6)/dt);step++){
  const oldK=kinetic(),speed=Math.hypot(vx,vz),drag=.5*1.225*p.cda*.0001*speed,dragScale=Math.max(0,1-drag*dt/m);vx*=dragScale;vz*=dragScale;dissipated+=Math.max(0,oldK-kinetic());
  vz-=9.81*dt;
  const cs=[0,1].map(j=>{const a=axle(j),q=surface(profiles.points,a.x,r);if(!q)return null;const gap=(a.z-q.z)*q.nz,vn=(vx-omega*a.b)*q.nx+(vz+omega*a.a)*q.nz;maxPenetration=Math.max(maxPenetration,-gap);if(gap>Math.max(0,-vn*dt)+.000002)return null;const bounce=!contacts[j]&&vn<-.05?-p.restitution*vn:0;if(bounce)impactPeak=Math.max(impactPeak,-vn);return {...a,...q,impact:!contacts[j]&&vn<-.05,gap,target:Math.max(-gap/dt,bounce),jn:0,jt:0,j};});
  const pre=kinetic();
  for(let it=0;it<32;it++)for(const q of cs){if(!q)continue;const rn=cross(q.a,q.b,q.nx,q.nz),vn=(vx-omega*q.b)*q.nx+(vz+omega*q.a)*q.nz,delta=(q.target-vn)/(1/m+rn*rn/I),next=Math.max(0,q.jn+delta),imp=next-q.jn;q.jn=next;vx+=imp*q.nx/m;vz+=imp*q.nz/m;omega+=imp*rn/I;
   if(q.jn>0){const rt=cross(q.a,q.b,q.tx,q.tz),slip=(vx-omega*q.b)*q.tx+(vz+omega*q.a)*q.tz-spin[q.j],jt=-slip/(1/m+rt*rt/I+1/mw);vx+=jt*q.tx/m;vz+=jt*q.tz/m;omega+=jt*rt/I;spin[q.j]-=jt/mw;q.jt+=jt;}
  }
  // Net collision/rolling synchronization loss; energy gains remain residual.
  if(cs.some(q=>q&&q.impact)){const after=kinetic();dissipated+=Math.max(0,pre-after);events.push({t,type:'impact',before:pre,after});}
  loads=cs.map(q=>q?q.jn/dt:0);const next=loads.map(v=>v>1e-6);
  next.forEach((on,j)=>{if(on!==contacts[j])events.push({t,axle:j===0?'Rear':'Front',type:on?'contact':'lift'});});contacts=next;
  // Dissipative wheel torque is limited so it cannot reverse the wheel.
  const beforeResistance=kinetic();for(let j=0;j<2;j++)if(contacts[j]){const loss=(p.crr*loads[j]+p.axle*.001/(2*r))*dt;spin[j]=Math.sign(spin[j])*Math.max(0,Math.abs(spin[j])-loss/mw);}dissipated+=Math.max(0,beforeResistance-kinetic());
  cx+=vx*dt;cz+=vz*dt;angle+=omega*dt;t+=dt;peak=Math.max(peak,Math.hypot(vx,vz));if(!contacts[0]&&!contacts[1])airTime+=dt;else if(contacts[0]!==contacts[1])singleTime+=dt;
  x=cx+(.5-f)*wb*Math.cos(angle)+h*Math.sin(angle);z=cz+(.5-f)*wb*Math.sin(angle)-h*Math.cos(angle);
  if(step%5===0)capture();
  if(![cx,cz,omega].every(Number.isFinite)||maxPenetration>.001){status='invalid';break;}
  if(bodyGap(profiles,x,z,angle,g.length/1000,(g.clearance-p.radius)/1000)<-.0002){status='chassis-contact';break;}
  if(x+g.length/2000*Math.cos(angle)-Math.min((g.clearance-p.radius)/1000*Math.sin(angle),((g.clearance-p.radius)/1000+.014)*Math.sin(angle))>=profiles.points.at(-1)[0]){status='finished';break;}
  if(t>.5&&vx<.001&&Math.abs(vz)<.01&&Math.abs(omega)<.1){status='stalled';break;}
  if(cx<profiles.points[0][0]||cz<datum-.2||Math.abs(angle)>Math.PI){status='offtrack';break;}
 }
 capture();const maxResidual=Math.max(...samples.map(s=>Math.abs(s.residual)));if(maxResidual>Math.max(.002,initialEnergy*.03))status='invalid';
 return {p,g,d,profiles,samples,events,time:t,status,peak,airTime,singleTime,impactPeak,initialEnergy,maxResidual,maxPenetration,dt};
}
const api={defaults,specs,sanitize,surface,bodyGap,transform,simulate};global.DerbyDynamics=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
