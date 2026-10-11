// Functional obstacle geometry. The same outlines drive collisions and preset previews.
export const EXTRA_SHAPES = {
  oval: {
    label:'Oval', scale:1, viewBox:'-34 -19 68 38',
    polygons:[], ellipses:[[0,0,30,15]],
    note:'Compare this long, rounded outline with the circle. How does the wake change when both shapes are equally tall?'
  },
  triangle: {
    label:'Triangle', scale:1, viewBox:'-27 -19 54 38',
    polygons:[[[-23,0],[23,-15],[23,15]]], ellipses:[],
    note:'The point faces the incoming flow. Compare the flow around the pointed front and the flat rear, then try changing the angle.'
  },
  diamond: {
    label:'Diamond', scale:1, viewBox:'-32 -19 64 38',
    polygons:[[[-28,0],[0,-15],[28,0],[0,15]]], ellipses:[],
    note:'Compare the pointed front and rear with the triangle. Look for changes where the flow passes the sharp corners.'
  },
  bus: {
    label:'Bus', scale:1, viewBox:'-36 -22 72 44',
    polygons:[[[-32,-10],[-27,-17],[27,-17],[32,-12],[32,11],[-32,11]]],
    ellipses:[[-21,11,6,6],[21,11,6,6]],
    note:'Compare this tall bus outline with the car. Use Equally tall to compare their silhouettes at the same front-facing height.'
  },
  truck: {
    label:'Truck', scale:1, viewBox:'-38 -22 76 44',
    polygons:[[[-34,-6],[-28,-6],[-22,-14],[-10,-14],[-10,10],[-34,10]],[[-8,-17],[33,-17],[33,10],[-8,10]]],
    ellipses:[[-23,11,6,6],[15,11,6,6],[27,11,6,6]],
    note:'Watch the flow around the cab, the gap and the box-shaped rear. This is a stationary 2D outline, not a road or vehicle test.'
  },
  airplane: {
    label:'Airplane', scale:1, viewBox:'-38 -23 76 46',
    polygons:[[[-34,0],[-25,-5],[-4,-5],[8,-20],[15,-20],[8,-5],[24,-4],[29,-13],[34,-13],[32,0],[34,13],[29,13],[24,4],[8,5],[15,20],[8,20],[-4,5],[-25,5]]],
    ellipses:[],
    note:'Explore the wake around this top-view airplane silhouette. It is a flat stationary obstacle; this view does not model wing lift or flight.'
  },
  car: {
    label:'Car', scale:1, viewBox:'-36 -19 72 39',
    polygons:[[[-32,5],[-29,-1],[-17,-4],[-9,-13],[13,-13],[24,-3],[30,0],[32,10],[-32,10]]],
    ellipses:[[-20,10,5,5],[20,10,5,5]],
    note:'Compare the wake behind this car silhouette with the streamlined shape. It is a 2D outline, not a real vehicle test.'
  },
  bird: {
    label:'Bird', scale:.9, viewBox:'-42 -29 84 45',
    polygons:[[[-38,-3],[-29,-7],[-27,-10],[-23,-12],[-19,-11],[-16,-8],[-14,-3],[-9,-1],[-4,-2],[1,-10],[7,-19],[17,-26],[16,-18],[12,-9],[8,-2],[17,0],[26,-2],[37,-6],[32,1],[38,6],[25,5],[18,7],[11,11],[3,12],[-5,10],[-11,6],[-16,1],[-21,-3],[-28,-3]]],
    ellipses:[],
    note:'This side view shows a bird with a raised wing. Follow the flow around its beak, body and tail. The silhouette stays still; it does not model flapping flight.'
  },
  dolphin: {
    label:'Dolphin', scale:.8, viewBox:'-45 -24 90 46',
    polygons:[[[-41,-2],[-33,-4],[-30,-8],[-25,-11],[-17,-13],[-8,-13],[-3,-14],[1,-19],[6,-21],[5,-15],[9,-11],[17,-8],[24,-3],[31,0],[37,-3],[42,-7],[40,0],[35,3],[40,7],[42,12],[34,8],[29,4],[22,4],[14,5],[4,8],[3,13],[5,18],[0,16],[-6,8],[-13,8],[-21,5],[-28,1],[-33,0],[-40,1]]],
    ellipses:[],
    note:'Compare this dolphin side view with the tuna. Look at the rounded head, dorsal fin and tapered body. This is a stationary 2D outline in the same fluid model; it does not simulate swimming or measure real water resistance.'
  },
  tuna: {
    label:'Tuna', scale:.8, viewBox:'-45 -26 94 52',
    polygons:[[[-41,0],[-36,-5],[-29,-10],[-20,-13],[-10,-14],[-5,-22],[0,-15],[7,-12],[13,-16],[14,-10],[19,-7],[23,-10],[24,-5],[29,-3],[35,-2],[42,-17],[46,-22],[44,-9],[40,0],[44,9],[46,22],[42,17],[35,2],[29,3],[24,5],[23,9],[19,7],[13,10],[10,16],[5,12],[-2,14],[-8,13],[-13,20],[-15,12],[-23,11],[-31,7],[-37,3]]],
    ellipses:[],
    note:'Compare this tuna side view with the dolphin. Follow the flow around its pointed head, fins and forked tail. This is a stationary 2D outline in the same fluid model; it does not simulate swimming or measure real water resistance.'
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
