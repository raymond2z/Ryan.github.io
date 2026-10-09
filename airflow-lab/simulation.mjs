// Independent D2Q9 lattice-Boltzmann implementation (regularized BGK collision).
// Public quantities use simulation units; the collision kernel uses lattice units.
// This is a qualitative teaching model.
import {inExtraShape} from './shapes.mjs';
const CX = [0,1,0,-1,0,1,-1,-1,1];
const CY = [0,0,1,0,-1,1,1,-1,-1];
const WT = [4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36];
const OP = [0,3,4,1,2,7,8,5,6];

export class FluidSimulation {
  constructor(width=240,height=104) {
    this.width=width; this.height=height; this.n=width*height;
    // Two half-time steps keep lattice velocities low while preserving the
    // public velocity, viscosity and Reynolds number in simulation units.
    this.dt=.5;
    this.f=new Float64Array(this.n*9); this.next=new Float64Array(this.n*9);
    this.rho=new Float64Array(this.n); this.ux=new Float64Array(this.n); this.uy=new Float64Array(this.n);
    this.solid=new Uint8Array(this.n); this.speed=.085; this.viscosity=.025;
    this.inletSpeed=this.speed;
    this.collisionEq=new Float64Array(9);this.collisionCorrection=new Float64Array(9);
    this.time=0; this.forceX=0; this.forceY=0; this.shape='circle'; this.angle=0;
    this.setShape('circle',0);
  }
  equilibriumAt(i,u=this.speed*this.dt,v=0,rho=1,target=this.f) {
    const u2=u*u+v*v;
    for(let q=0;q<9;q++) { const cu=CX[q]*u+CY[q]*v; target[q*this.n+i]=WT[q]*rho*(1+3*cu+4.5*cu*cu-1.5*u2); }
  }
  reset() {
    this.inletSpeed=this.speed;
    for(let i=0;i<this.n;i++) {
      this.equilibriumAt(i,this.solid[i]?0:this.speed*this.dt); this.rho[i]=1;
      this.ux[i]=this.solid[i]?0:this.speed; this.uy[i]=0;
    }
    this.time=0; this.forceX=0; this.forceY=0;
  }
  setShape(shape,angle=0,position=null) {
    this.shape=shape; this.angle=angle; this.solid.fill(0);
    const centerX=Math.round(this.width*.30),centerY=this.height/2;
    this.centerX=centerX;this.centerY=centerY;
    const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
    for(let y=3;y<this.height-3;y++) for(let x=3;x<this.width-3;x++) {
      const dx=x-centerX,dy=y-centerY,px=dx*c+dy*s,py=-dx*s+dy*c;
      let inside=false;
      if(shape==='circle') inside=px*px+py*py<=15*15;
      if(shape==='block') inside=Math.abs(px)<=15&&Math.abs(py)<=15;
      if(shape==='plate') inside=Math.abs(px)<=2&&Math.abs(py)<=19;
      if(shape==='car'||shape==='bird'||shape==='pikachu')inside=inExtraShape(shape,px,py);
      if(shape==='streamlined') {
        const t=(px+21)/64;
        if(t>=0&&t<=1) {
          // Match the 30-cell frontal height of the block and circle at 0°.
          const thickness=5*.47*64*(.2969*Math.sqrt(t)-.126*t-.3516*t*t+.2843*t*t*t-.1036*t*t*t*t);
          inside=Math.abs(py)<=thickness;
        }
      }
      if(inside) this.solid[x+y*this.width]=1;
    }
    if(position)this.translateMask(this.solid.slice(),position.x-centerX,position.y-centerY,{x:centerX,y:centerY});
    this.reset();
  }
  obstacleBounds(mask=this.solid) {
    let minX=this.width,minY=this.height,maxX=-1,maxY=-1;
    for(let i=0;i<this.n;i++)if(mask[i]){
      const x=i%this.width,y=Math.floor(i/this.width);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    return maxX<0?null:{minX,maxX,minY,maxY};
  }
  translateMask(mask,dx,dy,origin={x:this.centerX,y:this.centerY}) {
    const b=this.obstacleBounds(mask);if(!b)return false;
    // Keep the entire obstacle inside the domain. Existing drawings closer to
    // an edge may stay there, but cannot be shifted farther out.
    const marginX=Math.min(8,b.minX,this.width-1-b.maxX),marginY=Math.min(8,b.minY,this.height-1-b.maxY);
    dx=Math.round(Math.max(marginX-b.minX,Math.min(this.width-1-marginX-b.maxX,dx)));
    dy=Math.round(Math.max(marginY-b.minY,Math.min(this.height-1-marginY-b.maxY,dy)));
    this.solid.fill(0);
    for(let i=0;i<this.n;i++)if(mask[i])this.solid[i+dx+dy*this.width]=1;
    this.centerX=origin.x+dx;this.centerY=origin.y+dy;
    return {dx,dy,x:this.centerX,y:this.centerY};
  }
  brush(x,y,radius,erase=false) {
    const r=Math.max(1,Math.min(8,radius));
    for(let yy=Math.floor(y-r);yy<=y+r;yy++) for(let xx=Math.floor(x-r);xx<=x+r;xx++) {
      if(xx<3||xx>=this.width-3||yy<3||yy>=this.height-3||(xx-x)**2+(yy-y)**2>r*r) continue;
      this.solid[xx+yy*this.width]=erase?0:1;
    }
    this.shape='custom';
  }
  push(x,y,dx,dy) {
    for(let yy=Math.max(2,Math.floor(y-6));yy<Math.min(this.height-2,y+6);yy++)
      for(let xx=Math.max(2,Math.floor(x-6));xx<Math.min(this.width-2,x+6);xx++) {
        const i=xx+yy*this.width;
        if(this.solid[i]) continue;
        const weight=Math.max(0,1-Math.hypot(xx-x,yy-y)/6);
        let u=this.ux[i]+Math.max(-.035,Math.min(.035,dx*.008))*weight;
        let v=this.uy[i]+Math.max(-.035,Math.min(.035,dy*.008))*weight;
        const magnitude=Math.hypot(u,v);
        if(magnitude>.5){u*=.5/magnitude;v*=.5/magnitude;}
        this.equilibriumAt(i,u*this.dt,v*this.dt,this.rho[i]); this.ux[i]=u;this.uy[i]=v;
      }
  }
  step() {
    this.substep();this.substep();this.time++;
  }
  substep() {
    const w=this.width,h=this.height,n=this.n,f=this.f,g=this.next;
    const omega=1/(3*this.viscosity*this.dt+.5); g.fill(0);
    // Smooth inlet changes over a few hundred steps without destroying the wake.
    this.inletSpeed+=Math.max(-.00025*this.dt,Math.min(.00025*this.dt,this.speed-this.inletSpeed));
    const equilibrium=this.collisionEq,correction=this.collisionCorrection;
    let fx=0,fy=0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const i=x+y*w; if(this.solid[i]) continue;
      let rho=0,u=0,v=0,pxx=0,pxy=0,pyy=0;
      for(let q=0;q<9;q++) {
        const value=f[q*n+i],cx=CX[q],cy=CY[q];
        rho+=value;u+=value*cx;v+=value*cy;
        pxx+=value*cx*cx;pxy+=value*cx*cy;pyy+=value*cy*cy;
      }
      u/=rho;v/=rho;
      const u2=u*u+v*v;
      pxx-=rho*(u*u+1/3);pxy-=rho*u*v;pyy-=rho*(v*v+1/3);
      let limiter=1;
      for(let q=0;q<9;q++) {
        const cx=CX[q],cy=CY[q],cu=cx*u+cy*v;
        const eq=WT[q]*rho*(1+3*cu+4.5*cu*cu-1.5*u2);
        if(eq<=0||!Number.isFinite(eq))throw new Error('unstable');
        // Reconstruct non-equilibrium populations from the viscous stress tensor.
        // This removes unsupported higher-order modes while conserving mass and momentum.
        const reg=4.5*WT[q]*((cx*cx-1/3)*pxx+2*cx*cy*pxy+(cy*cy-1/3)*pyy);
        const delta=(1-omega)*reg;
        equilibrium[q]=eq;correction[q]=delta;
        // One scalar for all directions preserves the conserved moments.
        // Limiting adds local numerical damping only when a population would be negative.
        if(delta<0)limiter=Math.min(limiter,.999*eq/-delta);
      }
      for(let q=0;q<9;q++) {
        const post=equilibrium[q]+limiter*correction[q];
        const xx=x+CX[q],yy=y+CY[q];
        if(xx<0||xx>=w||yy<0||yy>=h) continue;
        const j=xx+yy*w;
        if(this.solid[j]) { g[OP[q]*n+i]+=post;fx+=2*post*CX[q];fy+=2*post*CY[q]; }
        else g[q*n+j]+=post;
      }
    }
    // Uniform inlet and far-field boundaries; zero-gradient outflow.
    for(let y=0;y<h;y++) {
      this.equilibriumAt(y*w,this.inletSpeed*this.dt,0,1,g);
      for(let q=0;q<9;q++) g[q*n+y*w+w-1]=g[q*n+y*w+w-2];
    }
    for(let x=0;x<w;x++) {this.equilibriumAt(x,this.inletSpeed*this.dt,0,1,g);this.equilibriumAt(x+(h-1)*w,this.inletSpeed*this.dt,0,1,g);}
    this.f=g; this.next=f;
    for(let i=0;i<n;i++) {
      if(this.solid[i]) {this.rho[i]=1;this.ux[i]=0;this.uy[i]=0;continue;}
      let rho=0,u=0,v=0;
      for(let q=0;q<9;q++) {const value=g[q*n+i];rho+=value;u+=value*CX[q];v+=value*CY[q];}
      if(!Number.isFinite(rho)||rho<.2||rho>3||!Number.isFinite(u)||!Number.isFinite(v)) throw new Error('unstable');
      this.rho[i]=rho;this.ux[i]=u/rho/this.dt;this.uy[i]=v/rho/this.dt;
    }
    const smoothing=1-Math.pow(.98,this.dt),forceScale=1/(this.dt*this.dt);
    this.forceX=(1-smoothing)*this.forceX+smoothing*fx*forceScale;
    this.forceY=(1-smoothing)*this.forceY+smoothing*fy*forceScale;
  }
  sample(x,y) {
    const xx=Math.max(1,Math.min(this.width-2,Math.round(x))),yy=Math.max(1,Math.min(this.height-2,Math.round(y)));
    const i=xx+yy*this.width;
    return {x:xx,y:yy,solid:!!this.solid[i],speed:Math.hypot(this.ux[i],this.uy[i]),ux:this.ux[i],uy:this.uy[i],density:this.rho[i],curl:this.curlAt(i)};
  }
  curlAt(i) {const w=this.width;return (this.uy[i+1]-this.uy[i-1]-this.ux[i+w]+this.ux[i-w])*.5;}
}
