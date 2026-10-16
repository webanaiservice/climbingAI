import { describe, expect, it } from 'vitest';
import { clampView, fingerPair, INITIAL_VIEW, photoCoordinates, zoomView } from './board-viewport';
import { nearbyTianyuTargets, pickTianyuPhotoTarget } from './tianyu-interaction';

describe('board-local touch zoom and picking',()=>{
  it('spreading fingers zooms in and pinching together zooms out',()=>{
    const before=fingerPair([{x:100,y:100},{x:200,y:100}]);
    const after=fingerPair([{x:50,y:100},{x:250,y:100}]);
    const enlarged=zoomView(INITIAL_VIEW,after.distance/before.distance,{x:0,y:0},600,600);
    expect(enlarged.scale).toBe(2);
    expect(zoomView(enlarged,before.distance/after.distance,{x:0,y:0},600,600)).toEqual(INITIAL_VIEW);
  });
  it('keeps the local image under the zoom anchor and clamps blank-space panning',()=>{
    expect(zoomView(INITIAL_VIEW,2,{x:50,y:60},600,600)).toEqual({scale:2,x:-50,y:-60});
    expect(clampView({scale:2,x:999,y:-999},800,600)).toEqual({scale:2,x:200,y:-300});
    expect(clampView({scale:.1,x:20,y:30},600,600)).toEqual(INITIAL_VIEW);
    expect(clampView({scale:20,x:0,y:0},600,600).scale).toBe(4);
  });
  it('selects the same hold after 2× zoom, panning and a scaled border',()=>{
    const point=photoCoordinates({x:360,y:520},{left:100,top:200,width:1040,height:1040},{width:500,height:500,borderX:10,borderY:10,outerWidth:520,outerHeight:520});
    expect(point).toEqual({x:120,y:150});
    expect(pickTianyuPhotoTarget([{id:'a',x:24,y:30,radius:1}],point,{width:500,height:500},true,2)?.id).toBe('a');
  });
  it('does not multiply the finger hit radius when the image is zoomed',()=>{
    const targets=[{id:'a',x:50,y:50,radius:1}];
    expect(pickTianyuPhotoTarget(targets,{x:270,y:250},{width:500,height:500},true,1)?.id).toBe('a');
    expect(pickTianyuPhotoTarget(targets,{x:270,y:250},{width:500,height:500},true,2)).toBeNull();
  });
  it('offers nearby ambiguous points in distance order, excluding distant holds',()=>{
    const targets=[{id:'a',x:40,y:50,radius:1},{id:'b',x:43,y:50,radius:1},{id:'c',x:70,y:50,radius:1}];
    expect(nearbyTianyuTargets(targets,{x:209,y:250},{width:500,height:500}).map(x=>x.target.id)).toEqual(['b','a']);
    expect(nearbyTianyuTargets(targets,{x:209,y:250},{width:500,height:500},4)).toHaveLength(1);
  });
  it('ignores taps outside the photo and invalid scale values',()=>{
    const targets=[{id:'edge',x:0,y:50,radius:1}];
    expect(nearbyTianyuTargets(targets,{x:-1,y:250},{width:500,height:500})).toEqual([]);
    expect(pickTianyuPhotoTarget(targets,{x:0,y:250},{width:500,height:500},true,0)).toBeNull();
    expect(nearbyTianyuTargets(targets,{x:0,y:250},{width:500,height:500},NaN)).toEqual([]);
  });
});
