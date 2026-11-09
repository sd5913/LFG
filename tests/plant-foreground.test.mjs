import test from 'node:test';
import assert from 'node:assert/strict';
import {plantPixels,isPlantPixel} from '../src/game/plant-foreground.js';
import {BACKGROUND,OBSTACLES,PLANTS,roomRect} from '../src/game/config.js';

test('floor tiles stay transparent even when the guide includes their pixels',()=>{
 const original=new Uint8ClampedArray([73,103,114,255,130,145,149,255]);
 const guide=new Uint8ClampedArray([0,0,0,255,0,0,0,255]);
 assert.deepEqual([...plantPixels(original,guide,2,1,{x:0,y:0,width:2,height:1})],[0,0,0,0,0,0,0,0]);
});

test('the foreground copies original plant colour, never generated guide colour',()=>{
 const original=new Uint8ClampedArray([145,158,118,255,221,164,105,255,17,40,52,255]);
 const guide=new Uint8ClampedArray([255,0,255,255,0,0,255,255,255,255,0,255]);
 assert.deepEqual([...plantPixels(original,guide,3,1,{x:0,y:0,width:3,height:1})],[...original]);
});

test('source colours alone cannot make a foreground when no alpha guide is present',()=>{
 const original=new Uint8ClampedArray([145,158,118,255]);
 assert.equal(plantPixels(original,new Uint8ClampedArray(4),1,1,{x:0,y:0,width:1,height:1})[3],0);
});

test('central plant blocks its full frame while the other seven retain pot-only collision',()=>{
 assert.equal(PLANTS.length,8);
 for(const plant of PLANTS){
  const collider=OBSTACLES.find(o=>o.id===plant.id);
  assert.deepEqual(collider,roomRect({id:plant.id,...(plant.id==='plant-centre' ? plant.frame : plant.pot)}));
  assert.ok(plant.frame.y<plant.pot.y);
  assert.ok(plant.frame.height>plant.pot.height);
  assert.ok(plant.frame.x>=0 && plant.frame.y>=BACKGROUND.roomTop);
  assert.ok(plant.frame.x+plant.frame.width<=BACKGROUND.width);
  assert.ok(plant.frame.y+plant.frame.height<=BACKGROUND.height);
 }
 const central=PLANTS.find(p=>p.id==='plant-centre');
 assert.deepEqual(central.pot,{x:687,y:548,width:89,height:61});
});
