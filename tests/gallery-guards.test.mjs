import test from 'node:test';
import assert from 'node:assert/strict';
import { GALLERY_GUARDS } from '../src/game/config.js';
import { afterSuccessfulPose, galleryAlertRate, GUARD_CONFUSION_MS } from '../src/game/gallery-guards.js';

test('the two gallery NPCs have independent profiles and one shared alert meter', () => {
  const [gallery, treasure] = GALLERY_GUARDS;
  assert.notEqual(gallery.id, treasure.id);
  assert.notEqual(gallery.patrolPoints, treasure.patrolPoints);
  assert.equal(treasure.alertRate, gallery.alertRate * 2);
  const guards = [{ profile: gallery, mode: 'patrol' }, { profile: treasure, mode: 'patrol' }];
  assert.equal(galleryAlertRate(guards), -7);
  guards[0].mode = 'chase';
  assert.equal(galleryAlertRate(guards), 16);
  guards[1].mode = 'chase';
  assert.equal(galleryAlertRate(guards), 32);
  guards[0].mode = 'confused';
  assert.equal(galleryAlertRate(guards), 0);
});

test('a successful pose preserves positions and pauses the pursuing NPCs for three seconds', () => {
  const before = {
    x: 500, y: 300, alertLevel: 45,
    guards: [
      { id: 'gallery', x: 120, y: 200, mode: 'patrol' },
      { id: 'treasure', x: 900, y: 300, mode: 'chase' },
    ],
  };
  const after = afterSuccessfulPose(before);
  assert.equal(after.guards[0].mode, 'patrol');
  assert.deepEqual(after.guards[1], {
    ...before.guards[1], mode: 'confused', confusionRemaining: GUARD_CONFUSION_MS,
  });
  assert.equal(before.guards[1].mode, 'chase');
  assert.equal(after.alertLevel, 45);
  assert.equal(GUARD_CONFUSION_MS, 3000);
});
