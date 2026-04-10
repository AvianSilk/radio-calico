const express = require('express');
const db = require('../db/database');

const router = express.Router();

function getUserId(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

async function getCounts(song_key) {
  const { rows } = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN rating =  1 THEN 1 ELSE 0 END), 0)::int AS likes,
      COALESCE(SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END), 0)::int AS dislikes
    FROM ratings WHERE song_key = $1
  `, [song_key]);
  return rows[0];
}

// GET /api/ratings?song_key=...
router.get('/', async (req, res) => {
  const { song_key } = req.query;
  if (!song_key) return res.status(400).json({ error: 'song_key required' });

  const userId = getUserId(req);
  const counts = await getCounts(song_key);
  const { rows } = await db.query(
    'SELECT rating FROM ratings WHERE user_id = $1 AND song_key = $2',
    [userId, song_key]
  );

  res.json({ likes: counts.likes, dislikes: counts.dislikes, user_rating: rows[0]?.rating ?? null });
});

// POST /api/ratings  { song_key, rating: 1 | -1 }
router.post('/', async (req, res) => {
  const { song_key, rating } = req.body;
  if (!song_key || ![1, -1].includes(rating)) {
    return res.status(400).json({ error: 'song_key and rating (1 or -1) required' });
  }

  const userId = getUserId(req);
  const { rows: existing } = await db.query(
    'SELECT rating FROM ratings WHERE user_id = $1 AND song_key = $2',
    [userId, song_key]
  );

  if (existing[0]?.rating === rating) {
    // Same button clicked again — toggle off
    await db.query(
      'DELETE FROM ratings WHERE user_id = $1 AND song_key = $2',
      [userId, song_key]
    );
  } else {
    await db.query(`
      INSERT INTO ratings (user_id, song_key, rating)
      VALUES ($1, $2, $3)
      ON CONFLICT(user_id, song_key) DO UPDATE SET rating = EXCLUDED.rating, updated_at = CURRENT_TIMESTAMP
    `, [userId, song_key, rating]);
  }

  const counts = await getCounts(song_key);
  const { rows } = await db.query(
    'SELECT rating FROM ratings WHERE user_id = $1 AND song_key = $2',
    [userId, song_key]
  );

  res.json({ likes: counts.likes, dislikes: counts.dislikes, user_rating: rows[0]?.rating ?? null });
});

module.exports = router;
