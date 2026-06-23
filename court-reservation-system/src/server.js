const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { client, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'court-booking-dev-secret';
const JWT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const DAILY_BOOKING_LIMIT = 2;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

async function one(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows[0] || null;
}

async function all(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: JWT_MAX_AGE_MS,
  });
}

async function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: '請先登入' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await one('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!user) {
      return res.status(401).json({ error: '請先登入' });
    }
    req.currentUser = user;
    next();
  } catch {
    return res.status(401).json({ error: '請先登入' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.currentUser.role)) {
      return res.status(403).json({ error: '權限不足' });
    }
    next();
  };
}

// For venue-scoped routes: owner may operate on any venue via venue_id param,
// venue_admin/coach/member are locked to their own venue_id.
function resolveVenueId(req) {
  if (req.currentUser.role === 'owner') {
    return Number(req.query.venue_id || req.body.venue_id) || null;
  }
  return req.currentUser.venue_id;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    venue_id: user.venue_id,
  };
}

function asyncRoute(handler) {
  return (req, res, next) => handler(req, res, next).catch(next);
}

// ---------- Venues (public list, for registration) ----------

app.get(
  '/api/venues',
  asyncRoute(async (req, res) => {
    res.json(await all('SELECT id, name, address FROM venues ORDER BY id'));
  })
);

// ---------- Auth ----------

app.post(
  '/api/auth/register',
  asyncRoute(async (req, res) => {
    const { name, email, phone, password, venue_id } = req.body || {};
    if (!name || !email || !password || !venue_id) {
      return res.status(400).json({ error: '請填寫姓名、Email、密碼，並選擇場館' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email 格式錯誤' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密碼至少需 6 個字元' });
    }

    const venue = await one('SELECT id FROM venues WHERE id = ?', [venue_id]);
    if (!venue) {
      return res.status(400).json({ error: '請選擇有效的場館' });
    }

    const existing = await one('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: '此 Email 已被註冊' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await client.execute({
      sql: 'INSERT INTO users (name, email, phone, password_hash, role, venue_id) VALUES (?, ?, ?, ?, ?, ?)',
      args: [name, email, phone || null, passwordHash, 'member', venue_id],
    });

    const user = await one('SELECT * FROM users WHERE id = ?', [Number(result.lastInsertRowid)]);
    setAuthCookie(res, user);
    res.status(201).json(publicUser(user));
  })
);

app.post(
  '/api/auth/login',
  asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: '請輸入 Email 與密碼' });
    }

    const user = await one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email 或密碼錯誤' });
    }

    setAuthCookie(res, user);
    res.json(publicUser(user));
  })
);

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.status(204).end();
});

app.get(
  '/api/auth/me',
  asyncRoute(async (req, res) => {
    const token = req.cookies.token;
    if (!token) {
      return res.json(null);
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await one('SELECT * FROM users WHERE id = ?', [payload.id]);
      res.json(user ? publicUser(user) : null);
    } catch {
      res.json(null);
    }
  })
);

// ---------- Slots (time grid for quick mobile booking, scoped to member's venue) ----------

const SLOT_HOURS = Array.from({ length: 15 }, (_, i) => 7 + i); // 07:00 - 21:00

app.get(
  '/api/slots',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { date } = req.query;
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ error: '請提供有效日期 (YYYY-MM-DD)' });
    }
    if (!req.currentUser.venue_id) {
      return res.status(400).json({ error: '此帳號未綁定場館' });
    }

    const courts = await all('SELECT * FROM courts WHERE venue_id = ? ORDER BY id', [req.currentUser.venue_id]);
    const bookings = await all(
      `SELECT bookings.* FROM bookings
       JOIN courts ON courts.id = bookings.court_id
       WHERE courts.venue_id = ? AND booking_date = ?`,
      [req.currentUser.venue_id, date]
    );

    const slots = courts.map((court) => {
      const hours = SLOT_HOURS.map((hour) => {
        const start = `${String(hour).padStart(2, '0')}:00`;
        const end = `${String(hour + 1).padStart(2, '0')}:00`;
        const booking = bookings.find(
          (b) => b.court_id === court.id && overlaps(start, end, b.start_time, b.end_time)
        );
        if (!booking) {
          return { start, end, status: 'available' };
        }
        const isMine = req.currentUser.id === booking.user_id;
        return {
          start,
          end,
          status: isMine ? 'mine' : 'booked',
          booking_id: isMine ? booking.id : undefined,
        };
      });
      return { court_id: court.id, court_name: court.name, location: court.location, hours };
    });

    res.json(slots);
  })
);

// ---------- Bookings ----------

app.get(
  '/api/bookings/mine',
  requireAuth,
  asyncRoute(async (req, res) => {
    const bookings = await all(
      `SELECT bookings.*, courts.name AS court_name FROM bookings
       JOIN courts ON courts.id = bookings.court_id
       WHERE user_id = ?
       ORDER BY booking_date DESC, start_time DESC`,
      [req.currentUser.id]
    );
    res.json(bookings);
  })
);

app.post(
  '/api/bookings',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { court_id, booking_date, start_time, end_time } = req.body || {};

    if (!court_id || !booking_date || !start_time || !end_time) {
      return res.status(400).json({ error: '請填寫所有欄位' });
    }
    if (!DATE_RE.test(booking_date)) {
      return res.status(400).json({ error: '日期格式錯誤，請使用 YYYY-MM-DD' });
    }
    if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time)) {
      return res.status(400).json({ error: '時間格式錯誤，請使用 HH:MM' });
    }
    if (start_time >= end_time) {
      return res.status(400).json({ error: '結束時間必須晚於開始時間' });
    }

    const court = await one('SELECT * FROM courts WHERE id = ?', [court_id]);
    if (!court || court.venue_id !== req.currentUser.venue_id) {
      return res.status(404).json({ error: '找不到該球場' });
    }

    const dailyCount = await one(
      'SELECT COUNT(*) AS count FROM bookings WHERE user_id = ? AND booking_date = ?',
      [req.currentUser.id, booking_date]
    );
    if (Number(dailyCount.count) >= DAILY_BOOKING_LIMIT) {
      return res.status(409).json({ error: `每人每日最多預約 ${DAILY_BOOKING_LIMIT} 個時段` });
    }

    const sameDay = await all('SELECT * FROM bookings WHERE court_id = ? AND booking_date = ?', [
      court_id,
      booking_date,
    ]);
    const conflict = sameDay.some((b) => overlaps(start_time, end_time, b.start_time, b.end_time));
    if (conflict) {
      return res.status(409).json({ error: '該時段已被預約，請選擇其他時間' });
    }

    const result = await client.execute({
      sql: 'INSERT INTO bookings (court_id, user_id, booking_date, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
      args: [court_id, req.currentUser.id, booking_date, start_time, end_time],
    });

    const booking = await one('SELECT * FROM bookings WHERE id = ?', [Number(result.lastInsertRowid)]);
    res.status(201).json(booking);
  })
);

app.delete(
  '/api/bookings/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const booking = await one('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) {
      return res.status(404).json({ error: '找不到該預約' });
    }
    const court = await one('SELECT * FROM courts WHERE id = ?', [booking.court_id]);
    const canManageVenue =
      req.currentUser.role === 'owner' ||
      (req.currentUser.role === 'venue_admin' && req.currentUser.venue_id === court.venue_id);
    if (booking.user_id !== req.currentUser.id && !canManageVenue) {
      return res.status(403).json({ error: '無法取消他人的預約' });
    }
    await client.execute({ sql: 'DELETE FROM bookings WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  })
);

// ---------- Owner (platform-level) ----------

app.get(
  '/api/owner/venues',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    res.json(await all('SELECT * FROM venues ORDER BY id'));
  })
);

app.post(
  '/api/owner/venues',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    const { name, address } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: '請輸入場館名稱' });
    }
    const result = await client.execute({
      sql: 'INSERT INTO venues (name, address) VALUES (?, ?)',
      args: [name, address || null],
    });
    res.status(201).json(await one('SELECT * FROM venues WHERE id = ?', [Number(result.lastInsertRowid)]));
  })
);

app.put(
  '/api/owner/venues/:id',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    const venue = await one('SELECT * FROM venues WHERE id = ?', [req.params.id]);
    if (!venue) {
      return res.status(404).json({ error: '找不到該場館' });
    }
    const { name, address } = req.body || {};
    await client.execute({
      sql: 'UPDATE venues SET name = ?, address = ? WHERE id = ?',
      args: [name || venue.name, address !== undefined ? address : venue.address, req.params.id],
    });
    res.json(await one('SELECT * FROM venues WHERE id = ?', [req.params.id]));
  })
);

app.delete(
  '/api/owner/venues/:id',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    const courts = await all('SELECT id FROM courts WHERE venue_id = ?', [req.params.id]);
    for (const court of courts) {
      await client.execute({ sql: 'DELETE FROM bookings WHERE court_id = ?', args: [court.id] });
    }
    await client.execute({ sql: 'DELETE FROM courts WHERE venue_id = ?', args: [req.params.id] });
    await client.execute({
      sql: "UPDATE users SET role = 'member', venue_id = NULL WHERE venue_id = ?",
      args: [req.params.id],
    });
    const result = await client.execute({ sql: 'DELETE FROM venues WHERE id = ?', args: [req.params.id] });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: '找不到該場館' });
    }
    res.status(204).end();
  })
);

app.get(
  '/api/owner/venue-admins',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    res.json(
      await all(
        `SELECT users.id, users.name, users.email, users.venue_id, venues.name AS venue_name
         FROM users JOIN venues ON venues.id = users.venue_id
         WHERE users.role = 'venue_admin' ORDER BY users.id`
      )
    );
  })
);

app.post(
  '/api/owner/venue-admins',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    const { email, venue_id } = req.body || {};
    if (!email || !venue_id) {
      return res.status(400).json({ error: '請輸入會員 Email 並選擇場館' });
    }
    const venue = await one('SELECT * FROM venues WHERE id = ?', [venue_id]);
    if (!venue) {
      return res.status(404).json({ error: '找不到該場館' });
    }
    const user = await one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(404).json({ error: '找不到此 Email 對應的會員，請先請他註冊一個帳號' });
    }
    await client.execute({
      sql: "UPDATE users SET role = 'venue_admin', venue_id = ? WHERE id = ?",
      args: [venue_id, user.id],
    });
    res.status(201).json(publicUser(await one('SELECT * FROM users WHERE id = ?', [user.id])));
  })
);

app.delete(
  '/api/owner/venue-admins/:id',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    const user = await one("SELECT * FROM users WHERE id = ? AND role = 'venue_admin'", [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: '找不到該場主' });
    }
    await client.execute({ sql: "UPDATE users SET role = 'member' WHERE id = ?", args: [user.id] });
    res.status(204).end();
  })
);

app.get(
  '/api/owner/overview',
  requireAuth,
  requireRole('owner'),
  asyncRoute(async (req, res) => {
    res.json(
      await all(
        `SELECT venues.id AS venue_id, venues.name AS venue_name,
                (SELECT COUNT(*) FROM courts WHERE courts.venue_id = venues.id) AS court_count,
                (SELECT COUNT(*) FROM bookings JOIN courts ON courts.id = bookings.court_id WHERE courts.venue_id = venues.id) AS booking_count
         FROM venues ORDER BY venues.id`
      )
    );
  })
);

// ---------- Venue admin (scoped to one venue; owner can pass venue_id to act on any venue) ----------

app.get(
  '/api/venue-admin/courts',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    if (!venueId) {
      return res.status(400).json({ error: '請指定場館' });
    }
    res.json(await all('SELECT * FROM courts WHERE venue_id = ? ORDER BY id', [venueId]));
  })
);

app.post(
  '/api/venue-admin/courts',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    const { name, location } = req.body || {};
    if (!venueId || !name) {
      return res.status(400).json({ error: '請指定場館並輸入球場名稱' });
    }
    const result = await client.execute({
      sql: 'INSERT INTO courts (venue_id, name, location) VALUES (?, ?, ?)',
      args: [venueId, name, location || null],
    });
    res.status(201).json(await one('SELECT * FROM courts WHERE id = ?', [Number(result.lastInsertRowid)]));
  })
);

app.put(
  '/api/venue-admin/courts/:id',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    const court = await one('SELECT * FROM courts WHERE id = ?', [req.params.id]);
    if (!court || court.venue_id !== venueId) {
      return res.status(404).json({ error: '找不到該球場' });
    }
    const { name, location } = req.body || {};
    await client.execute({
      sql: 'UPDATE courts SET name = ?, location = ? WHERE id = ?',
      args: [name || court.name, location !== undefined ? location : court.location, req.params.id],
    });
    res.json(await one('SELECT * FROM courts WHERE id = ?', [req.params.id]));
  })
);

app.delete(
  '/api/venue-admin/courts/:id',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    const court = await one('SELECT * FROM courts WHERE id = ?', [req.params.id]);
    if (!court || court.venue_id !== venueId) {
      return res.status(404).json({ error: '找不到該球場' });
    }
    await client.execute({ sql: 'DELETE FROM bookings WHERE court_id = ?', args: [req.params.id] });
    await client.execute({ sql: 'DELETE FROM courts WHERE id = ?', args: [req.params.id] });
    res.status(204).end();
  })
);

app.get(
  '/api/venue-admin/bookings',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    if (!venueId) {
      return res.status(400).json({ error: '請指定場館' });
    }
    const { date } = req.query;
    let query = `
      SELECT bookings.*, courts.name AS court_name, users.name AS booker_name, users.email AS booker_email
      FROM bookings
      JOIN courts ON courts.id = bookings.court_id
      JOIN users ON users.id = bookings.user_id
      WHERE courts.venue_id = ?
    `;
    const params = [venueId];
    if (date) {
      query += ' AND booking_date = ?';
      params.push(date);
    }
    query += ' ORDER BY booking_date DESC, start_time';
    res.json(await all(query, params));
  })
);

app.get(
  '/api/venue-admin/coaches',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    if (!venueId) {
      return res.status(400).json({ error: '請指定場館' });
    }
    res.json(
      await all("SELECT id, name, email, phone FROM users WHERE role = 'coach' AND venue_id = ? ORDER BY id", [
        venueId,
      ])
    );
  })
);

app.post(
  '/api/venue-admin/coaches',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    const { email } = req.body || {};
    if (!venueId || !email) {
      return res.status(400).json({ error: '請指定場館並輸入會員 Email' });
    }
    const user = await one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || user.venue_id !== venueId || user.role !== 'member') {
      return res.status(404).json({ error: '請輸入此場館內現有會員的 Email' });
    }
    await client.execute({ sql: "UPDATE users SET role = 'coach' WHERE id = ?", args: [user.id] });
    res.status(201).json(publicUser(await one('SELECT * FROM users WHERE id = ?', [user.id])));
  })
);

app.delete(
  '/api/venue-admin/coaches/:id',
  requireAuth,
  requireRole('owner', 'venue_admin'),
  asyncRoute(async (req, res) => {
    const venueId = resolveVenueId(req);
    const user = await one("SELECT * FROM users WHERE id = ? AND role = 'coach'", [req.params.id]);
    if (!user || user.venue_id !== venueId) {
      return res.status(404).json({ error: '找不到該教練' });
    }
    await client.execute({ sql: "UPDATE users SET role = 'member' WHERE id = ?", args: [user.id] });
    res.status(204).end();
  })
);

if (require.main === module) {
  init()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`球場預約系統已啟動：http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('資料庫初始化失敗', err);
      process.exit(1);
    });
}

module.exports = { app, init };
