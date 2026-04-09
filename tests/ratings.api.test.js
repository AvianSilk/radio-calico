'use strict';

// Replace the real pg Pool with a pg-mem in-memory Postgres instance.
// The factory closes over _mockPool, which is initialised in beforeAll —
// the closure is evaluated at call time (not at require time), so this is safe.
let mockPool;

jest.mock('../db/database', () => ({
  query: (...args) => mockPool.query(...args),
}));

const { newDb } = require('pg-mem');
const request = require('supertest');
const express = require('express');
const ratingsRouter = require('../routes/ratings');

const app = express();
app.use(express.json());
app.use('/api/ratings', ratingsRouter);

beforeAll(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  mockPool = new Pool();
  await mockPool.query(`
    CREATE TABLE IF NOT EXISTS ratings (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT        NOT NULL,
      song_key   TEXT        NOT NULL,
      rating     INTEGER     NOT NULL CHECK(rating IN (1, -1)),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, song_key)
    )
  `);
});

// Reset table state between tests for full isolation.
afterEach(async () => {
  await mockPool.query('DELETE FROM ratings');
  jest.resetAllMocks();
});

const SONG_KEY = 'Pink Floyd|||Comfortably Numb';
const OTHER_KEY = 'Miles Davis|||Kind of Blue';

// Helper: returns an object whose methods issue requests pre-seeded with an IP.
// supertest v7 requires .set() to be chained after the HTTP method, not before.
function asUser(ip) {
  return {
    get:  (url) => request(app).get(url).set('X-Forwarded-For', ip),
    post: (url) => request(app).post(url).set('X-Forwarded-For', ip),
  };
}

// ── GET /api/ratings ──────────────────────────────────────────────────────────

describe('GET /api/ratings', () => {
  test('400 when song_key is missing', async () => {
    const res = await request(app).get('/api/ratings');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/song_key/);
  });

  test('returns zeroed counts and null user_rating for an unknown song', async () => {
    const res = await asUser('1.1.1.1')
      .get(`/api/ratings?song_key=${encodeURIComponent(SONG_KEY)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ likes: 0, dislikes: 0, user_rating: null });
  });

  test('reflects a previously submitted like', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating: 1 });

    const res = await asUser('1.1.1.1')
      .get(`/api/ratings?song_key=${encodeURIComponent(SONG_KEY)}`);
    expect(res.body).toEqual({ likes: 1, dislikes: 0, user_rating: 1 });
  });

  test('reflects a previously submitted dislike', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating: -1 });

    const res = await asUser('1.1.1.1')
      .get(`/api/ratings?song_key=${encodeURIComponent(SONG_KEY)}`);
    expect(res.body).toEqual({ likes: 0, dislikes: 1, user_rating: -1 });
  });

  test('shows aggregate counts from multiple users', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating:  1 });
    await asUser('2.2.2.2').post('/api/ratings').send({ song_key: SONG_KEY, rating:  1 });
    await asUser('3.3.3.3').post('/api/ratings').send({ song_key: SONG_KEY, rating: -1 });

    // A fourth user who has not voted sees the running totals.
    const res = await asUser('4.4.4.4')
      .get(`/api/ratings?song_key=${encodeURIComponent(SONG_KEY)}`);
    expect(res.body).toEqual({ likes: 2, dislikes: 1, user_rating: null });
  });

  test('each user sees their own user_rating independently', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating:  1 });
    await asUser('2.2.2.2').post('/api/ratings').send({ song_key: SONG_KEY, rating: -1 });

    const [res1, res2] = await Promise.all([
      asUser('1.1.1.1').get(`/api/ratings?song_key=${encodeURIComponent(SONG_KEY)}`),
      asUser('2.2.2.2').get(`/api/ratings?song_key=${encodeURIComponent(SONG_KEY)}`),
    ]);

    expect(res1.body.user_rating).toBe(1);
    expect(res2.body.user_rating).toBe(-1);
    expect(res1.body.likes).toBe(1);
    expect(res1.body.dislikes).toBe(1);
  });
});

// ── POST /api/ratings ─────────────────────────────────────────────────────────

describe('POST /api/ratings', () => {
  test('400 when song_key is missing', async () => {
    const res = await request(app).post('/api/ratings').send({ rating: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test.each([
    ['zero',    { song_key: SONG_KEY, rating:  0   }],
    ['string',  { song_key: SONG_KEY, rating: 'up' }],
    ['missing', { song_key: SONG_KEY              }],
  ])('400 when rating is %s', async (_label, body) => {
    const res = await request(app).post('/api/ratings').send(body);
    expect(res.status).toBe(400);
  });

  test('submitting a like returns updated counts', async () => {
    const res = await asUser('1.1.1.1')
      .post('/api/ratings').send({ song_key: SONG_KEY, rating: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ likes: 1, dislikes: 0, user_rating: 1 });
  });

  test('submitting a dislike returns updated counts', async () => {
    const res = await asUser('1.1.1.1')
      .post('/api/ratings').send({ song_key: SONG_KEY, rating: -1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ likes: 0, dislikes: 1, user_rating: -1 });
  });

  test('clicking the same button twice toggles the vote off', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating: 1 });
    const res = await asUser('1.1.1.1')
      .post('/api/ratings').send({ song_key: SONG_KEY, rating: 1 });
    expect(res.body).toEqual({ likes: 0, dislikes: 0, user_rating: null });
  });

  test('switching from like to dislike replaces the vote', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating:  1 });
    const res = await asUser('1.1.1.1')
      .post('/api/ratings').send({ song_key: SONG_KEY, rating: -1 });
    expect(res.body).toEqual({ likes: 0, dislikes: 1, user_rating: -1 });
  });

  test('switching from dislike to like replaces the vote', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating: -1 });
    const res = await asUser('1.1.1.1')
      .post('/api/ratings').send({ song_key: SONG_KEY, rating:  1 });
    expect(res.body).toEqual({ likes: 1, dislikes: 0, user_rating: 1 });
  });

  test('ratings for one song do not bleed into another', async () => {
    await asUser('1.1.1.1').post('/api/ratings').send({ song_key: SONG_KEY, rating: 1 });
    const res = await asUser('1.1.1.1')
      .get(`/api/ratings?song_key=${encodeURIComponent(OTHER_KEY)}`);
    expect(res.body).toEqual({ likes: 0, dislikes: 0, user_rating: null });
  });

  test('song_key containing ||| is stored and retrieved correctly', async () => {
    const key = 'Artist With Spaces|||Title With Spaces & Symbols!';
    const post = await asUser('1.1.1.1')
      .post('/api/ratings').send({ song_key: key, rating: 1 });
    expect(post.status).toBe(200);

    const get = await asUser('1.1.1.1')
      .get(`/api/ratings?song_key=${encodeURIComponent(key)}`);
    expect(get.body).toEqual({ likes: 1, dislikes: 0, user_rating: 1 });
  });
});
