// Airflow Lab Stage 2 — regularized BGK D2Q9 solver (f32).
// One kernel per lattice operation; two substeps = one public simulation step.
// Streaming uses pull-gather so no concurrent writes or atomics are required.
struct Config {
  width: u32,
  height: u32,
  count: u32,
  pad: u32,
  omega: f32,
  inletU: f32,
  pad2: f32,
  pad3: f32,
}
@group(0) @binding(0) var<storage,read> input: array<f32>;
@group(0) @binding(1) var<storage,read_write> output: array<f32>;
@group(0) @binding(2) var<storage,read> solid: array<u32>;
@group(0) @binding(3) var<uniform> cfg: Config;

const CX: array<i32,9> = array<i32,9>(0,1,0,-1,0,1,-1,-1,1);
const CY: array<i32,9> = array<i32,9>(0,0,1,0,-1,1,1,-1,-1);
const OP: array<u32,9> = array<u32,9>(0u,3u,4u,1u,2u,7u,8u,5u,6u);
const WT: array<f32,9> = array<f32,9>(
  4.0/9.0,1.0/9.0,1.0/9.0,1.0/9.0,1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0
);
fn eq(q:u32, rho:f32, u:f32, v:f32)->f32 {
  let cu = f32(CX[q])*u + f32(CY[q])*v;
  return WT[q]*rho*(1.0+3.0*cu+4.5*cu*cu-1.5*(u*u+v*v));
}
@compute @workgroup_size(64)
fn collision(@builtin(global_invocation_id) tid:vec3<u32>){
  let i=tid.x;
  if(i>=cfg.count){return;}
  if(solid[i]!=0u){
    for(var q:u32=0u;q<9u;q++){output[q*cfg.count+i]=0.0;}
    return;
  }
  var rho=0.0;var u=0.0;var v=0.0;
  var pxx=0.0;var pxy=0.0;var pyy=0.0;
  for(var q:u32=0u;q<9u;q++){
    let f=input[q*cfg.count+i];
    let x=f32(CX[q]);let y=f32(CY[q]);
    rho+=f;u+=f*x;v+=f*y;
    pxx+=f*x*x;pxy+=f*x*y;pyy+=f*y*y;
  }
  u/=rho;v/=rho;
  pxx-=rho*(u*u+1.0/3.0);
  pxy-=rho*u*v;
  pyy-=rho*(v*v+1.0/3.0);
  var equilibrium:array<f32,9>;
  var correction:array<f32,9>;
  var limiter=1.0;
  for(var q:u32=0u;q<9u;q++){
    let x=f32(CX[q]);let y=f32(CY[q]);
    let equ=eq(q,rho,u,v);
    let reg=4.5*WT[q]*((x*x-1.0/3.0)*pxx+2.0*x*y*pxy+(y*y-1.0/3.0)*pyy);
    let delta=(1.0-cfg.omega)*reg;
    equilibrium[q]=equ;correction[q]=delta;
    if(delta<0.0){limiter=min(limiter,0.999*equ/(-delta));}
  }
  for(var q:u32=0u;q<9u;q++){
    output[q*cfg.count+i]=equilibrium[q]+limiter*correction[q];
  }
}
fn gather(q:u32,x:i32,y:i32,target:u32)->f32{
  if(solid[target]!=0u){return 0.0;}
  let sx=x-CX[q];let sy=y-CY[q];
  if(sx<0||sy<0||sx>=i32(cfg.width)||sy>=i32(cfg.height)){return 0.0;}
  let src=u32(sx)+u32(sy)*cfg.width;
  if(solid[src]!=0u){
    // A population aimed at a solid neighbor is reflected into the same fluid cell.
    return input[OP[q]*cfg.count+target];
  }
  return input[q*cfg.count+src];
}
@compute @workgroup_size(64)
fn streaming(@builtin(global_invocation_id) tid:vec3<u32>){
  let i=tid.x;
  if(i>=cfg.count){return;}
  let x=i%cfg.width;let y=i/cfg.width;
  // JS model overwrites far field and inlet after streaming.
  if(x==0u||y==0u||y==cfg.height-1u){
    for(var q:u32=0u;q<9u;q++){
      output[q*cfg.count+i]=eq(q,1.0,cfg.inletU,0.0);
    }
    return;
  }
  if(x==cfg.width-1u){
    // Zero-gradient outflow copies the streaming result from one column left.
    let inner=i-1u;
    for(var q:u32=0u;q<9u;q++){
      output[q*cfg.count+i]=gather(q,i32(x)-1,i32(y),inner);
    }
    return;
  }
  for(var q:u32=0u;q<9u;q++){
    output[q*cfg.count+i]=gather(q,i32(x),i32(y),i);
  }
}
@compute @workgroup_size(64)
fn macroscopic(@builtin(global_invocation_id) tid:vec3<u32>){
  let i=tid.x;
  if(i>=cfg.count){return;}
  if(solid[i]!=0u){
    output[4u*i]=1.0;output[4u*i+1u]=0.0;output[4u*i+2u]=0.0;
    output[4u*i+3u]=1.0;return;
  }
  var rho=0.0;var ux=0.0;var uy=0.0;
  for(var q:u32=0u;q<9u;q++){
    let f=input[q*cfg.count+i];
    rho+=f;ux+=f*f32(CX[q]);uy+=f*f32(CY[q]);
  }
  output[4u*i]=rho;
  output[4u*i+1u]=ux/rho/0.5;
  output[4u*i+2u]=uy/rho/0.5;
  output[4u*i+3u]=0.0;
}
