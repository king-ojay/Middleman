import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telHref } from './format.js';

test('telHref dials a stored Rwandan number in international form', () => {
  assert.equal(telHref('0788123456'), 'tel:+250788123456');
  assert.equal(telHref('250788123456'), 'tel:+250788123456');
  assert.equal(telHref('+250 788 123 456'), 'tel:+250788123456');
  // anything else keeps its digits only, so the link can't carry other text
  assert.equal(telHref('12345'), 'tel:12345');
  assert.equal(telHref(undefined), 'tel:');
});
