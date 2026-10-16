import { describe, expect, it } from 'vitest';
import { fitFloorPoint, parseFloorDraft, serializeFloorDraft, type FloorHold, type FloorPlacement } from './floor-wall-data';
const hold: FloorHold = {id:'h1',serial:'H1',brand:'CT',material:'PU',productType:'岩点',description:'',grip:'把手',size:'M',sizeLabel:'M',dimensions:'20 × 20 cm',price:0,image:'/holds/h1.webp'};
const point: FloorPlacement={instanceId:'p1',hold,surfaceId:'F3',x:35.2,y:63.7,rotation:45,scale:1,role:'foot',startLimbs:['LF'],routeColor:'#ff5a36'};
describe('三维草稿恢复与边界',()=>{
  it('保留墙段、坐标、旋转、用途与起步肢体，并只使用本地可信岩点资产',()=>{
    const restored=parseFloorDraft(serializeFloorDraft([point],'F3'),[hold]);expect(restored.placements[0]).toMatchObject(point);expect(restored.faceId).toBe('F3');
  });
  it('拒绝重复实例、错误墙面、缺失资产与越界数值，不产生半份草稿',()=>{
    const data=JSON.parse(serializeFloorDraft([point],'F3'));
    for(const patch of [{x:101},{scale:-1},{surfaceId:'unknown'},{holdId:'missing'}]) expect(()=>parseFloorDraft(JSON.stringify({...data,placements:[{...data.placements[0],...patch}]}),[hold])).toThrow();
    expect(()=>parseFloorDraft(JSON.stringify({...data,placements:[data.placements[0],data.placements[0]]}),[hold])).toThrow();
  });
  it('边界留出岩点半径，连接面过窄不安装',()=>{
    const fitted=fitFloorPoint(hold,{surfaceId:'F2',x:0,y:100});expect(fitted.x).toBeGreaterThan(0);expect(fitted.y).toBeLessThan(100);
    expect(()=>fitFloorPoint(hold,{surfaceId:'J1',x:50,y:99})).toThrow('太窄');
  });
});
