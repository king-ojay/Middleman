// Unit tests for the ranking sentence (run: npm test in client/). Each
// pattern is built only from what the reason object carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonSentence, monthPhrase, topLabel } from './trustReason.js';

const now = new Date(2026, 10, 11); // 11 November 2026
const rating = (stars, extra) => ({ type: 'rating', stars, hired: true, month: '2026-03', ...extra });

test('direct: you hired and rated them, with the month', () => {
  assert.equal(reasonSentence({ tier: 'network', name: 'Diane', via: null, hops: [rating(4)] }, now),
    'You hired Diane in March and rated Diane 4★.');
  assert.equal(reasonSentence({ tier: 'network', name: 'Diane', via: null, hops: [rating(5, { type: 'vouch', month: '2026-11' })] }, now),
    'You hired Diane this month, rated Diane 5★ and vouched for Diane.');
});

test('direct: you invited them', () => {
  assert.equal(reasonSentence({ tier: 'network', name: 'Irene', via: null, hops: [{ type: 'invite', month: '2026-04' }] }, now),
    'You invited Irene.');
});

test('2 hops, without and with a vouch', () => {
  assert.equal(reasonSentence({ tier: 'network', name: 'Eric', via: 'Amina', hops: [rating(5), rating(5)] }, now),
    'You rated Amina 5★. Amina hired Eric and rated Eric 5★.');
  assert.equal(reasonSentence({ tier: 'network', name: 'Eric', via: 'Amina', hops: [rating(5), rating(4, { type: 'vouch' })] }, now),
    'You rated Amina 5★. Amina hired Eric, rated Eric 4★ and vouched for Eric.');
});

test('via an invite, then the next hop', () => {
  assert.equal(reasonSentence({ tier: 'network', name: 'Henri', via: 'Grace', hops: [{ type: 'invite', month: '2026-03' }, rating(4)] }, now),
    'You invited Grace. Grace hired Henri and rated Henri 4★.');
  assert.equal(reasonSentence({ tier: 'network', name: 'Eric', via: 'Amina', hops: [rating(5), { type: 'invite', month: '2026-03' }] }, now),
    'You rated Amina 5★. Amina invited Eric.');
});

test('2 hops when the hop-1 rating is not on the profile: no name', () => {
  assert.equal(reasonSentence({ tier: 'network', name: 'Jean', via: null, hops: [rating(5), rating(5)] }, now),
    'Someone you rated 5★ hired Jean and rated Jean 5★.');
});

test('3 hops: the middle person is "someone"', () => {
  assert.equal(reasonSentence({ tier: 'network', name: 'Eric', via: 'Amina', hops: [rating(5), rating(4), rating(5)] }, now),
    'You rated Amina 5★. Someone Amina hired rated Eric 5★.');
  assert.equal(reasonSentence({ tier: 'network', name: 'Gilbert', via: 'Bosco', hops: [rating(5), rating(5, { hired: false }), rating(5)] }, now),
    'You rated Bosco 5★. Someone Bosco worked for rated Gilbert 5★.');
});

test('area: the count, the area and the lowest stars', () => {
  assert.equal(reasonSentence({ tier: 'area', name: 'Kevin', area: 'kimironko', people: 3, minStars: 4 }),
    '3 people in Kimironko rated Kevin 4★ or higher.');
  assert.equal(reasonSentence({ tier: 'area', name: 'Kevin', area: 'gikondo', people: 1, minStars: 5 }),
    '1 person in Gikondo rated Kevin 5★.');
});

test('new: join month, verified or not', () => {
  assert.equal(reasonSentence({ tier: 'new', name: 'Lucie', verified: true, rated: false, joined: '2026-11' }, now),
    'Joined this month. Verified, no ratings yet.');
  assert.equal(reasonSentence({ tier: 'new', name: 'Moses', verified: false, rated: false, joined: '2026-11' }, now),
    'Joined this month. No ratings yet.');
  assert.equal(reasonSentence({ tier: 'new', name: 'Moses', verified: false, rated: false, joined: '2025-12' }, now),
    'Joined in December 2025. No ratings yet.');
  // rated, but not well enough to be trusted: "no ratings yet" would be false
  assert.equal(reasonSentence({ tier: 'new', name: 'Nadia', verified: false, rated: true, joined: '2026-03' }, now),
    'Joined in March. Not yet rated well by people you know.');
});

test('month phrases', () => {
  assert.equal(monthPhrase('2026-11', now), 'this month');
  assert.equal(monthPhrase('2026-01', now), 'in January');
  assert.equal(monthPhrase('2024-07', now), 'in July 2024');
  assert.equal(monthPhrase(null, now), '');
});

test('the first-ranked card label: network or area only', () => {
  assert.equal(topLabel({ tier: 'network' }), 'Most trusted for you');
  assert.equal(topLabel({ tier: 'area' }), 'Most trusted in your area');
  assert.equal(topLabel({ tier: 'new' }), null);
  assert.equal(topLabel(undefined), null);
});
