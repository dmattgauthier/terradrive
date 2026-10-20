import test from 'node:test';
import assert from 'node:assert/strict';
import { RegenHoldInput } from '../dist/src/electric-controls.js';

test('unrelated pointer release does not cancel held keyboard regeneration', () => {
  const changes = [], input = new RegenHoldInput(active => changes.push(active));
  input.setKeyboard(true); input.setPointer(8, false); input.setKeyboard(true);
  assert.equal(input.active, true); assert.deepEqual(changes, [true]);
  input.setKeyboard(false); assert.equal(input.active, false); assert.deepEqual(changes, [true, false]);
});

test('each paddle touch and the keyboard remain independent until the last hold releases', () => {
  const changes = [], input = new RegenHoldInput(active => changes.push(active));
  input.setPointer(7, true); input.setPointer(8, false); assert.equal(input.active, true);
  input.setPointer(9, true); input.setKeyboard(true); input.setPointer(7, false);
  input.setKeyboard(false); assert.equal(input.active, true);
  input.setPointer(9, false); assert.equal(input.active, false); assert.deepEqual(changes, [true, false]);
});

test('suspension clears all held sources and stale releases cannot reapply braking', () => {
  const changes = [], input = new RegenHoldInput(active => changes.push(active));
  input.setKeyboard(true); input.setPointer(3, true); input.clear();
  assert.equal(input.active, false); input.setPointer(3, false); input.setKeyboard(false); input.clear();
  assert.deepEqual(changes, [true, false]);
  input.setPointer(4, true); assert.equal(input.active, true); input.clear();
  assert.deepEqual(changes, [true, false, true, false]);
});
