import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCHES, BOTTOM_LIGHTS, OBSTACLES, PLANTS, roomRect } from '../src/game/config.js';
import { sceneryPixels, opaqueRectangles } from '../src/game/scenery-foreground.js';
import { alphaMask, solidSamples, fullyCovered } from '../src/game/occlusion.js';

test('benches block only the lower base and the central plant keeps full collision', () => {
  for (const bench of BENCHES) {
    assert.deepEqual(OBSTACLES.find(o => o.id === bench.id), roomRect({ id: bench.id, ...bench.base }));
    assert.ok(bench.base.y > bench.frame.y + bench.frame.height / 2);
  }
  const centre = PLANTS.find(p => p.id === 'plant-centre');
  assert.deepEqual(OBSTACLES.find(o => o.id === centre.id), roomRect({ id: centre.id, ...centre.frame }));
  assert.equal(BOTTOM_LIGHTS.length, 2);
  assert.equal(OBSTACLES.some(o => o.id.startsWith('light-')), false);
});

test('scenery preserves source furniture colour and excludes the lamps surrounding glow', () => {
  const source = new Uint8ClampedArray([73,103,114,255, 175,88,68,255]);
  assert.deepEqual([...sceneryPixels(source,2,1,{kind:'bench',frame:{x:0,y:0,width:2,height:1}})], [0,0,0,0,175,88,68,255]);
  const lampSource = new Uint8ClampedArray(57*56*4).fill(220);
  const lamp = sceneryPixels(lampSource,57,56,{kind:'lamp',frame:{x:0,y:0,width:57,height:56}});
  assert.equal(lamp[3],0);
  assert.equal(lamp[(20*57+28)*4+3],255);
  assert.equal(lamp[(20*57)*4+3],0);
});

test('exhibit hints require solid player pixels to be covered by an opaque foreground', () => {
  const playerMask = alphaMask(new Uint8Array([0,0,0,0, 0,0,0,255]),2,1);
  const points = solidSamples(playerMask);
  const cover = {width:2,height:1,alpha:new Uint8Array([255,255])};
  const player = {x:0,y:0,scaleX:1,scaleY:1,depth:5};
  const exhibit = {x:0,y:0,scaleX:1,scaleY:1,depth:10};
  assert.equal(fullyCovered(points,player,cover,exhibit),true);
  assert.equal(fullyCovered(points,player,cover,{...exhibit,depth:4}),false);
  assert.equal(fullyCovered(points,player,{...cover,alpha:new Uint8Array([255,0])},exhibit),false);
  assert.equal(fullyCovered(points,{...player,x:1},cover,exhibit),false);
  assert.equal(fullyCovered(new Float32Array(),player,cover,exhibit),false);
});

test('occlusion mapping follows displayed world scales rather than CSS viewport sizes', () => {
  const points = new Float32Array([0.5,0.5,1.5,0.5]);
  const mask = {width:4,height:2,alpha:new Uint8Array(8).fill(255)};
  const player = {x:100,y:200,scaleX:2,scaleY:2,depth:201};
  const exhibit = {x:100,y:200,scaleX:1,scaleY:1,depth:205};
  assert.equal(fullyCovered(points,player,mask,exhibit),true);
  assert.equal(fullyCovered(points,{...player,x:102},mask,exhibit),false);
});

test('foreground clipping rectangles preserve transparent gaps while merging repeated runs', () => {
  const rgba = new Uint8Array(4*3*4);
  for (const i of [0,1,3,4,5,7,9]) rgba[i*4+3] = 255;
  assert.deepEqual(opaqueRectangles(rgba,4,3),[
    {x:0,y:0,width:2,height:2},
    {x:3,y:0,width:1,height:2},
    {x:1,y:2,width:1,height:1},
  ]);
});
