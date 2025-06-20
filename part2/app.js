const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const PORT = 3000;

let db;

async function initDatabase() {
  db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'DogWalkService'
  });

  console.log('Connected to MySQL');

  await db.execute(`DELETE FROM WalkRatings`);
  await db.execute(`DELETE FROM WalkApplications`);
  await db.execute(`DELETE FROM WalkRequests`);
  await db.execute(`DELETE FROM Dogs`);
  await db.execute(`DELETE FROM Users`);

  await db.execute(`
    INSERT INTO Users (username, email, password_hash, role)
    VALUES 
      ('alice123', 'alice@example.com', 'hashed123', 'owner'),
      ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
      ('carol123', 'carol@example.com', 'hashed789', 'owner'),
      ('eveowner', 'eve@example.com', 'hashed654', 'owner'),
      ('newwalker', 'newwalker@example.com', 'hashed000', 'walker')
  `);

  await db.execute(`
    INSERT INTO Dogs (name, size, owner_id)
    VALUES 
      ('Max', 'medium', (SELECT user_id FROM Users WHERE username = 'alice123')),
      ('Bella', 'small', (SELECT user_id FROM Users WHERE username = 'carol123'))
  `);

  await db.execute(`
    INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
    VALUES
      ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'completed')
  `);

  await db.execute(`
    INSERT INTO WalkApplications (request_id, walker_id, status)
    VALUES (
      (SELECT request_id FROM WalkRequests WHERE status = 'completed' LIMIT 1),
      (SELECT user_id FROM Users WHERE username = 'bobwalker'),
      'accepted'
    )
  `);

  await db.execute(`
    INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
    VALUES (
      (SELECT request_id FROM WalkRequests WHERE status = 'completed' LIMIT 1),
      (SELECT user_id FROM Users WHERE username = 'bobwalker'),
      (SELECT user_id FROM Users WHERE username = 'carol123'),
      5, 'Great walk!'
    )
  `);
}

// Routes

// /api/dogs
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        wr.request_id,
        d.name AS dog_name,
        wr.requested_time,
        wr.duration_minutes,
        wr.location,
        u.username AS owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch open walk requests' });
  }
});

// /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        u.username AS walker_username,
        COUNT(r.rating_id) AS total_ratings,
        ROUND(AVG(r.rating), 1) AS average_rating,
        COUNT(CASE WHEN wr.status = 'completed' THEN 1 END) AS completed_walks
      FROM Users u
      LEFT JOIN WalkRatings r ON u.user_id = r.walker_id
      LEFT JOIN WalkRequests wr ON r.request_id = wr.request_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch walker summary' });
  }
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Database initialization failed:', err);
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});
