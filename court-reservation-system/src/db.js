const path = require('path');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', 'booking.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS courts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    FOREIGN KEY (venue_id) REFERENCES venues(id)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    venue_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (venue_id) REFERENCES venues(id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    court_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    booking_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (court_id) REFERENCES courts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
];

async function init() {
  for (const statement of SCHEMA_STATEMENTS) {
    await client.execute(statement);
  }

  const venueCount = await client.execute('SELECT COUNT(*) AS count FROM venues');
  if (Number(venueCount.rows[0].count) === 0) {
    const v1 = await client.execute({
      sql: 'INSERT INTO venues (name, address) VALUES (?, ?)',
      args: ['中山運動館', '台北市中山區中山北路 1 號'],
    });
    const v2 = await client.execute({
      sql: 'INSERT INTO venues (name, address) VALUES (?, ?)',
      args: ['信義運動館', '台北市信義區松仁路 1 號'],
    });
    const v1Id = Number(v1.lastInsertRowid);
    const v2Id = Number(v2.lastInsertRowid);

    const courts = [
      [v1Id, '匹克球場 A', '一樓'],
      [v1Id, '匹克球場 B', '一樓'],
      [v1Id, '羽球場 1', '二樓'],
      [v2Id, '羽球場 2', '二樓'],
      [v2Id, '匹克球場 C', '戶外'],
    ];
    for (const [venueId, name, location] of courts) {
      await client.execute({
        sql: 'INSERT INTO courts (venue_id, name, location) VALUES (?, ?, ?)',
        args: [venueId, name, location],
      });
    }

    const users = [
      ['業主', 'owner@example.com', 'owner123', 'owner', null],
      ['中山館場主', 'venueadmin1@example.com', 'admin123', 'venue_admin', v1Id],
      ['信義館場主', 'venueadmin2@example.com', 'admin123', 'venue_admin', v2Id],
      ['教練小李', 'coach1@example.com', 'coach123', 'coach', v1Id],
    ];
    for (const [name, email, password, role, venueId] of users) {
      await client.execute({
        sql: 'INSERT INTO users (name, email, password_hash, role, venue_id) VALUES (?, ?, ?, ?, ?)',
        args: [name, email, bcrypt.hashSync(password, 10), role, venueId],
      });
    }
  }
}

module.exports = { client, init };
