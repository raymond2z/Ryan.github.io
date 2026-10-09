// Functional obstacle geometry. The same outlines drive collisions and preset previews.
export const EXTRA_SHAPES = {
  car: {
    label:'Car', scale:1, viewBox:'-36 -19 72 39',
    polygons:[[[-32,5],[-29,-1],[-17,-4],[-9,-13],[13,-13],[24,-3],[30,0],[32,10],[-32,10]]],
    ellipses:[[-20,10,5,5],[20,10,5,5]],
    note:'Compare the wake behind this car silhouette with the streamlined shape. It is a 2D outline, not a real vehicle test.'
  },
  bird: {
    label:'Bird', scale:.9, viewBox:'-37 -29 74 43',
    polygons:[[[-33,-2],[-24,-6],[-20,-10],[-13,-9],[-8,-5],[0,-5],[10,-24],[16,-26],[12,-6],[27,-10],[32,-6],[23,1],[30,9],[24,10],[12,5],[3,8],[-9,5],[-17,0],[-24,0]]],
    ellipses:[[-18,-5,6,5],[-2,1,15,6]],
    note:'Follow the flow around the beak, wing and tail. This is a stationary bird silhouette; it does not model flapping flight.'
  },
  pikachu: {
    label:'Pikachu', scale:.72, viewBox:'-26 -35 67 63',
    polygons:[[[-12,-10],[-20,-29],[-15,-31],[-6,-13]],[[2,-13],[9,-31],[14,-29],[9,-10]],[[10,14],[19,11],[17,2],[24,3],[21,-7],[33,-11],[37,0],[28,1],[29,10],[22,9],[23,18],[11,21]]],
    ellipses:[[-3,-6,11,9],[0,10,13,13],[-15,8,6,4],[13,8,6,4],[-7,21,7,3],[8,21,7,3]],
    note:'Look for small wakes around the ears and lightning-shaped tail. Try moving or tilting this playful silhouette.'
  }
};
function inPolygon(x,y,points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
export function inExtraShape(name,x,y) {
  const shape=EXTRA_SHAPES[name];if(!shape)return false;
  x/=shape.scale;y/=shape.scale;
  return shape.ellipses.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1)||shape.polygons.some(points=>inPolygon(x,y,points));
}
export function shapePreview(name) {
  const shape=EXTRA_SHAPES[name];
  return `<svg viewBox="${shape.viewBox}" aria-hidden="true">${shape.polygons.map(points=>`<polygon points="${points.map(p=>p.join(',')).join(' ')}"/>`).join('')}${shape.ellipses.map(([cx,cy,rx,ry])=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join('')}</svg>`;
}
