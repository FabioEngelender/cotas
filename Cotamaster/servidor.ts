import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("database.db");

// Inicialização do Banco de Dados
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'manager', 'client')) NOT NULL,
    cpf TEXT,
    pix_key TEXT,
    signed_term_at DATETIME,
    signed_term_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    total_quotas INTEGER NOT NULL,
    quota_price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    owner_id INTEGER,
    status TEXT CHECK(status IN ('available', 'sold', 'grouped')) DEFAULT 'available',
    parent_quota_id INTEGER,
    fraction_index INTEGER,
    price REAL,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quota_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    due_date DATE NOT NULL,
    status TEXT CHECK(status IN ('pending', 'paid')) DEFAULT 'pending',
    paid_at DATETIME,
    FOREIGN KEY(quota_id) REFERENCES quotas(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Criar Admin padrão se não existir
const adminExists = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
if (!adminExists) {
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run(
    "Admin Master",
    "admin@cotamaster.com",
    "admin123",
    "admin"
  );
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Middleware de Autenticação
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Não autorizado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Token inválido" });
  }
};

// Rotas da API
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user: any = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
  if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
  
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

app.get("/api/products", authenticate, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, 
    (SELECT COUNT(*) FROM quotas q WHERE q.product_id = p.id AND q.status = 'available') as available_quotas,
    (SELECT COUNT(*) FROM quotas q WHERE q.product_id = p.id AND q.status = 'sold') as sold_quotas
    FROM products p
  `).all();
  res.json(products);
});

app.post("/api/products", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
  const { name, description, total_quotas, quota_price } = req.body;
  
  const info = db.prepare("INSERT INTO products (name, description, total_quotas, quota_price) VALUES (?, ?, ?, ?)").run(
    name, description, total_quotas, quota_price
  );
  
  const productId = info.lastInsertRowid;
  const insertQuota = db.prepare("INSERT INTO quotas (product_id, status, price) VALUES (?, 'available', ?)");
  
  const transaction = db.transaction((id, price, count) => {
    for (let i = 0; i < count; i++) {
      insertQuota.run(id, price);
    }
  });
  
  transaction(productId, quota_price, total_quotas);
  res.json({ id: productId });
});

app.post("/api/quotas/reorganize", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado" });
  const { productId, quotasToGroup, subdivisionCount } = req.body;
  
  const placeholders = quotasToGroup.map(() => '?').join(',');
  db.prepare(`UPDATE quotas SET status = 'grouped' WHERE id IN (${placeholders})`).run(...quotasToGroup);
  
  const totalValue: any = db.prepare(`SELECT SUM(price) as total FROM quotas WHERE id IN (${placeholders})`).get(...quotasToGroup);
  const fractionPrice = totalValue.total / subdivisionCount;
  
  const insertQuota = db.prepare("INSERT INTO quotas (product_id, status, price, parent_quota_id) VALUES (?, 'available', ?, ?)");
  const transaction = db.transaction(() => {
    for (let i = 0; i < subdivisionCount; i++) {
      insertQuota.run(productId, fractionPrice, quotasToGroup[0]);
    }
  });
  transaction();
  res.json({ success: true });
});

// Socket.io para Chat
io.on("connection", (socket) => {
  socket.on("join_room", (productId) => {
    socket.join(`product_${productId}`);
  });

  socket.on("send_message", (data) => {
    const { productId, userId, userName, message } = data;
    db.prepare("INSERT INTO chat_messages (product_id, user_id, message) VALUES (?, ?, ?)").run(
      productId, userId, message
    );

    io.to(`product_${productId}`).emit("receive_message", {
      userName: userName.split(" ")[0],
      message: message,
      createdAt: new Date()
    });
  });
});

// Middleware do Vite para Desenvolvimento
async function startServer() {
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

  const PORT = 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();