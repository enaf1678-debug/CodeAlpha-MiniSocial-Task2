require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const multer = require("multer");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "public", "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed."));
    }
  }
});

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "social_media_db",
  waitForConnections: true,
  connectionLimit: 10
});

function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "7d" }
  );
}

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Login required." });
  }

  try {
    req.user = jwt.verify(
      header.replace("Bearer ", ""),
      process.env.JWT_SECRET || "dev_secret_change_me"
    );
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const [existing] = await pool.query(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username.trim(), email.trim().toLowerCase()]
    );

    if (existing.length) {
      return res.status(409).json({ message: "Username or email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)",
      [name.trim(), username.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const user = {
      id: result.insertId,
      name: name.trim(),
      username: username.trim()
    };

    res.status(201).json({
      message: "Account created.",
      token: createToken(user),
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error." });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(
      "SELECT id, name, username, email, password_hash FROM users WHERE email = ?",
      [email?.trim().toLowerCase()]
    );

    if (!rows.length || !(await bcrypt.compare(password || "", rows[0].password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = {
      id: rows[0].id,
      name: rows[0].name,
      username: rows[0].username
    };

    res.json({
      token: createToken(user),
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error." });
  }
});

// Current user
app.get("/api/me", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, username, email, bio, avatar FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json(rows[0]);
});

// Feed
app.get("/api/posts", auth, async (req, res) => {
  try {
    const [posts] = await pool.query(`
      SELECT
        p.id,
        p.content,
        p.image_url,
        p.created_at,
        u.id AS user_id,
        u.name,
        u.username,
        u.avatar,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments_count,
        EXISTS(
          SELECT 1 FROM likes my_l
          WHERE my_l.post_id = p.id AND my_l.user_id = ?
        ) AS liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
    `, [req.user.id]);

    res.json(posts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load posts." });
  }
});

// Create text/image post
app.post("/api/posts", auth, upload.single("image"), async (req, res) => {
  try {
    const content = req.body.content?.trim() || "";
    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : null;

    if (!content && !imageUrl) {
      return res.status(400).json({
        message: "Write something or select an image."
      });
    }

    if (content.length > 500) {
      return res.status(400).json({
        message: "Post must be 500 characters or less."
      });
    }

    await pool.query(
      "INSERT INTO posts (user_id, content, image_url) VALUES (?, ?, ?)",
      [req.user.id, content || null, imageUrl]
    );

    res.status(201).json({
      message: "Post published."
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Could not create post."
    });
  }
});

// Delete own post
app.delete("/api/posts/:id", auth, async (req, res) => {
  await pool.query(
    "DELETE FROM posts WHERE id = ? AND user_id = ?",
    [req.params.id, req.user.id]
  );
  res.json({ message: "Post deleted." });
});

// Toggle like
app.post("/api/posts/:id/like", auth, async (req, res) => {
  const postId = req.params.id;

  const [existing] = await pool.query(
    "SELECT id FROM likes WHERE post_id = ? AND user_id = ?",
    [postId, req.user.id]
  );

  if (existing.length) {
    await pool.query("DELETE FROM likes WHERE id = ?", [existing[0].id]);
    return res.json({ liked: false });
  }

  await pool.query(
    "INSERT INTO likes (post_id, user_id) VALUES (?, ?)",
    [postId, req.user.id]
  );

  res.json({ liked: true });
});

// Get comments
app.get("/api/posts/:id/comments", auth, async (req, res) => {
  const [comments] = await pool.query(`
    SELECT c.id, c.content, c.created_at, u.name, u.username
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `, [req.params.id]);

  res.json(comments);
});

// Add comment
app.post("/api/posts/:id/comments", auth, async (req, res) => {
  const content = req.body.content?.trim();

  if (!content) {
    return res.status(400).json({ message: "Comment cannot be empty." });
  }

  await pool.query(
    "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
    [req.params.id, req.user.id, content]
  );

  res.status(201).json({ message: "Comment added." });
});

// Search users
app.get("/api/users", auth, async (req, res) => {
  const q = `%${(req.query.q || "").trim()}%`;

  const [users] = await pool.query(`
    SELECT
      u.id, u.name, u.username, u.bio,
      EXISTS(
        SELECT 1 FROM followers f
        WHERE f.follower_id = ? AND f.following_id = u.id
      ) AS following
    FROM users u
    WHERE u.username LIKE ? OR u.name LIKE ?
    AND u.id != ?
    ORDER BY u.username
    LIMIT 20
  `, [req.user.id, q, q, req.user.id]);

  res.json(users);
});

// Follow/unfollow
app.post("/api/users/:id/follow", auth, async (req, res) => {
  const targetId = Number(req.params.id);

  if (targetId === req.user.id) {
    return res.status(400).json({ message: "You cannot follow yourself." });
  }

  const [existing] = await pool.query(
    "SELECT id FROM followers WHERE follower_id = ? AND following_id = ?",
    [req.user.id, targetId]
  );

  if (existing.length) {
    await pool.query("DELETE FROM followers WHERE id = ?", [existing[0].id]);
    return res.json({ following: false });
  }

  await pool.query(
    "INSERT INTO followers (follower_id, following_id) VALUES (?, ?)",
    [req.user.id, targetId]
  );

  res.json({ following: true });
});

// Profile
app.get("/api/users/:username", auth, async (req, res) => {
  const [users] = await pool.query(`
    SELECT id, name, username, bio, avatar,
      (SELECT COUNT(*) FROM followers WHERE following_id = users.id) AS followers_count,
      (SELECT COUNT(*) FROM followers WHERE follower_id = users.id) AS following_count
    FROM users
    WHERE username = ?
  `, [req.params.username]);

  if (!users.length) return res.status(404).json({ message: "User not found." });

  res.json(users[0]);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Social Media App running at http://localhost:${PORT}`);
});