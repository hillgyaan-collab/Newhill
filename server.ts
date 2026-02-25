import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("stories.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('authorized_url', '');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const result = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(result);
  });

  app.post("/api/settings", (req, res) => {
    const { authorized_url } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('authorized_url', ?)").run(authorized_url);
    res.json({ success: true });
  });

  app.get("/api/stories", (req, res) => {
    const stories = db.prepare("SELECT * FROM stories ORDER BY created_at DESC").all();
    res.json(stories);
  });

  app.post("/api/stories", (req, res) => {
    const { title, content, author } = req.body;
    if (!title || !content || !author) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const info = db.prepare("INSERT INTO stories (title, content, author) VALUES (?, ?, ?)").run(title, content, author);
    const newStory = db.prepare("SELECT * FROM stories WHERE id = ?").get(info.lastInsertRowid);
    res.json(newStory);
  });

  app.post("/api/stories/:id/like", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE stories SET likes = likes + 1 WHERE id = ?").run(id);
    const updatedStory = db.prepare("SELECT * FROM stories WHERE id = ?").get(id);
    res.json(updatedStory);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
