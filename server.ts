import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("database.db");
db.pragma('foreign_keys = ON');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cnpj TEXT,
    status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'manager', 'client')) NOT NULL,
    cpf TEXT,
    phone TEXT,
    address TEXT,
    pix_key TEXT,
    signed_term_at DATETIME,
    signed_term_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    UNIQUE(tenant_id, email)
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    total_quotas INTEGER NOT NULL,
    quota_price REAL NOT NULL,
    payment_type TEXT DEFAULT 'installments', -- 'cash' or 'installments'
    expiration_month TEXT, -- 'YYYY-MM'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS quotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    number TEXT,
    owner_id INTEGER,
    status TEXT CHECK(status IN ('available', 'sold', 'grouped')) DEFAULT 'available',
    parent_quota_id INTEGER, -- For subdivided quotas
    fraction_index INTEGER,
    price REAL,
    custom_name TEXT,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    quota_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    due_date DATE NOT NULL,
    status TEXT CHECK(status IN ('pending', 'paid')) DEFAULT 'pending',
    paid_at DATETIME,
    processed_by_id INTEGER,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(quota_id) REFERENCES quotas(id),
    FOREIGN KEY(processed_by_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    mention_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    tenant_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY(tenant_id, key),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  );
`);

// Seed default tenant if not exists
const tenantExists = db.prepare("SELECT * FROM tenants LIMIT 1").get();
let defaultTenantId: number;
if (!tenantExists) {
  const info = db.prepare("INSERT INTO tenants (name, cnpj, status) VALUES (?, ?, ?)").run(
    "CotaMaster Matriz",
    "00.000.000/0001-00",
    "active"
  );
  defaultTenantId = info.lastInsertRowid as number;
} else {
  defaultTenantId = (tenantExists as any).id;
}

// Migration: Add tenant_id to all tables if it doesn't exist (Simplified for SQLite)
const tablesToMigrate = ['users', 'products', 'quotas', 'installments', 'chat_messages', 'audit_logs', 'terms', 'settings'];
tablesToMigrate.forEach(table => {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const hasTenantId = columns.some((c: any) => c.name === 'tenant_id');
    
    if (!hasTenantId) {
      // Special case for settings and users because they need structural changes (PK/Unique)
      if (table === 'settings') {
        db.exec(`
          CREATE TABLE settings_new (
            tenant_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            value TEXT,
            PRIMARY KEY(tenant_id, key),
            FOREIGN KEY(tenant_id) REFERENCES tenants(id)
          );
          INSERT INTO settings_new (tenant_id, key, value) 
          SELECT ${defaultTenantId}, key, value FROM settings;
          DROP TABLE settings;
          ALTER TABLE settings_new RENAME TO settings;
        `);
      } else if (table === 'users') {
        db.exec(`
          CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('admin', 'manager', 'client')) NOT NULL,
            cpf TEXT,
            pix_key TEXT,
            signed_term_at DATETIME,
            signed_term_ip TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            phone TEXT,
            address TEXT,
            FOREIGN KEY(tenant_id) REFERENCES tenants(id),
            UNIQUE(tenant_id, email)
          );
          INSERT INTO users_new (id, tenant_id, name, email, password, role, cpf, pix_key, signed_term_at, signed_term_ip, created_at)
          SELECT id, ${defaultTenantId}, name, email, password, role, cpf, pix_key, signed_term_at, signed_term_ip, created_at FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;
        `);
      } else {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT ${defaultTenantId}`).run();
      }
    }
  } catch (e) {
    console.error(`Migration error on table ${table}:`, e);
  }
});

// Seed default settings for default tenant
const seedSettings = [
  { key: 'app_name', value: 'CotaMaster' },
  { key: 'admin_name', value: 'Cotamaster' }
];

seedSettings.forEach(s => {
  const exists = db.prepare("SELECT value FROM settings WHERE tenant_id = ? AND key = ?").get(defaultTenantId, s.key);
  if (!exists) {
    db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(defaultTenantId, s.key, s.value);
  } else if (s.key === 'admin_name' && (exists as any).value === 'Admin Master') {
    db.prepare("UPDATE settings SET value = ? WHERE tenant_id = ? AND key = ?").run(s.value, defaultTenantId, s.key);
  }
});

// Migration: Add payment_type and expiration_month to products
try {
  db.prepare("ALTER TABLE products ADD COLUMN payment_type TEXT DEFAULT 'installments'").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE products ADD COLUMN expiration_month TEXT").run();
} catch (e) {}

// Migration: Add image_url to products if it doesn't exist
try {
  db.prepare("ALTER TABLE products ADD COLUMN image_url TEXT").run();
} catch (e) {}

// Migration: Add mention_user_id to chat_messages
try {
  db.prepare("ALTER TABLE chat_messages ADD COLUMN mention_user_id INTEGER").run();
} catch (e) {}

// Migration: Add number to quotas if it doesn't exist
try {
  db.prepare("ALTER TABLE quotas ADD COLUMN number TEXT").run();
} catch (e) {}

// Migration: Add custom_name to quotas if it doesn't exist
try {
  db.prepare("ALTER TABLE quotas ADD COLUMN custom_name TEXT").run();
} catch (e) {}

// Migration: Add processed_by_id to installments if it doesn't exist
try {
  db.prepare("ALTER TABLE installments ADD COLUMN processed_by_id INTEGER").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN phone TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN address TEXT").run();
} catch (e) {}

// Migration: Add address subfields to users
try {
  db.prepare("ALTER TABLE users ADD COLUMN address_number TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN address_complement TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN address_cep TEXT").run();
} catch (e) {}

// Seed Admin if not exists for default tenant
const adminExists = db.prepare("SELECT * FROM users WHERE role = 'admin' AND tenant_id = ?").get(defaultTenantId);
if (!adminExists) {
  db.prepare("INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)").run(
    defaultTenantId,
    "Cotamaster",
    "admin@cotamaster.com",
    "admin123", // In a real app, hash this
    "admin"
  );
} else if ((adminExists as any).name === "Admin Master") {
  // Update existing admin name to the new generic name requested
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run("Cotamaster", (adminExists as any).id);
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  const tenantId = req.headers['x-tenant-id'];

  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    // Validate tenant isolation
    if (tenantId && decoded.tenant_id && parseInt(tenantId) !== decoded.tenant_id) {
      return res.status(403).json({ error: "Tenant mismatch" });
    }

    req.user = decoded;
    req.tenantId = decoded.tenant_id || (tenantId ? parseInt(tenantId as string) : null);
    
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Routes
app.get("/api/tenants", (req, res) => {
  const tenants = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as client_count
    FROM tenants t
    WHERE t.status = 'active'
    ORDER BY client_count DESC
  `).all();
  res.json(tenants);
});

app.delete("/api/tenants/:id", authenticate, (req: any, res) => {
  // Only admin of Matriz (ID 1) can delete other tenants
  if (req.user.role !== 'admin' || req.user.tenant_id !== 1) {
    return res.status(403).json({ error: "Apenas a Matriz pode excluir lojas" });
  }

  const { id } = req.params;
  const tenantId = parseInt(id);

  if (isNaN(tenantId)) {
    return res.status(400).json({ error: "ID da loja inválido" });
  }

  if (tenantId === 1) {
    return res.status(400).json({ error: "A Matriz não pode ser excluída" });
  }

  try {
    const deleteTransaction = db.transaction((tId: number) => {
      // Delete all data associated with this tenant
      // Order matters if foreign keys are enabled
      const tables = [
        'installments', 
        'quotas', 
        'chat_messages', 
        'audit_logs', 
        'terms', 
        'settings', 
        'products', 
        'users'
      ];
      
      for (const table of tables) {
        try {
          db.prepare(`DELETE FROM ${table} WHERE tenant_id = ?`).run(tId);
        } catch (tableErr: any) {
          console.error(`Error deleting from ${table}:`, tableErr);
          // If column doesn't exist, we might want to ignore it or handle it
          if (!tableErr.message.includes('no such column')) {
            throw tableErr;
          }
        }
      }
      
      // Finally delete the tenant itself
      db.prepare("DELETE FROM tenants WHERE id = ?").run(tId);
    });

    deleteTransaction(tenantId);
    res.json({ success: true });
  } catch (e: any) {
    console.error('Delete tenant error:', e);
    res.status(500).json({ error: e.message || "Erro interno ao excluir loja" });
  }
});

app.post("/api/tenants", (req, res) => {
  const { name, cnpj, image_url, adminName, adminEmail, password } = req.body;
  if (!name) return res.status(400).json({ error: "Nome da loja é obrigatório" });

  try {
    const info = db.prepare("INSERT INTO tenants (name, cnpj, status, image_url) VALUES (?, ?, ?, ?)").run(
      name,
      cnpj || null,
      'active',
      image_url || null
    );
    const tenantId = info.lastInsertRowid;

    // Seed default settings for the new tenant
    const seedSettings = [
      { key: 'app_name', value: name },
      { key: 'admin_name', value: adminName || 'Administrador' }
    ];
    seedSettings.forEach(s => {
      db.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(tenantId, s.key, s.value);
    });

    // Create a default admin user for this tenant
    const finalAdminEmail = adminEmail || `admin@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}${tenantId}.com`;
    const finalPassword = password || "admin123";
    
    db.prepare("INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)").run(
      tenantId,
      adminName || "Administrador",
      finalAdminEmail,
      finalPassword,
      "admin"
    );

    res.json({ id: tenantId, adminEmail: finalAdminEmail, adminPassword: finalPassword });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/settings", authenticate, (req: any, res) => {
  const settings = db.prepare("SELECT * FROM settings WHERE tenant_id = ?").all(req.tenantId);
  const settingsObj = settings.reduce((acc: any, s: any) => {
    acc[s.key] = s.value;
    return acc;
  }, {});
  res.json(settingsObj);
});

app.post("/api/settings", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { app_name, admin_name, password } = req.body;
  
  if (app_name) {
    db.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(req.tenantId, 'app_name', app_name);
    // Also update tenant name
    db.prepare("UPDATE tenants SET name = ? WHERE id = ?").run(app_name, req.tenantId);
  }
  if (admin_name) {
    db.prepare("INSERT OR REPLACE INTO settings (tenant_id, key, value) VALUES (?, ?, ?)").run(req.tenantId, 'admin_name', admin_name);
    // Also update the admin user name if it's the Admin Master
    db.prepare("UPDATE users SET name = ? WHERE role = 'admin' AND tenant_id = ?").run(admin_name, req.tenantId);
  }
  if (password) {
    db.prepare("UPDATE users SET password = ? WHERE role = 'admin' AND tenant_id = ?").run(password, req.tenantId);
  }
  
  res.json({ success: true });
});

app.get("/api/backup/export", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  
  const tables = ['users', 'products', 'quotas', 'installments', 'chat_messages', 'audit_logs', 'terms', 'settings'];
  const data: any = {};
  
  tables.forEach(table => {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all();
  });
  
  res.json(data);
});

app.post("/api/backup/import", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const data = req.body;
  
  try {
    const transaction = db.transaction(() => {
      Object.keys(data).forEach(table => {
        db.prepare(`DELETE FROM ${table}`).run();
        const rows = data[table];
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const placeholders = columns.map(() => '?').join(',');
          const insert = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
          rows.forEach((row: any) => {
            insert.run(Object.values(row));
          });
        }
      });
    });
    transaction();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stats", authenticate, (req: any, res) => {
  console.log(`[API] Stats requested for tenant ${req.tenantId} by user ${req.user.id}`);
  try {
    const stats = {
      products: db.prepare("SELECT COUNT(*) as count FROM products WHERE tenant_id = ?").get(req.tenantId)?.count || 0,
      sales: db.prepare("SELECT COUNT(*) as count FROM quotas WHERE status = 'sold' AND tenant_id = ?").get(req.tenantId)?.count || 0,
      revenue: db.prepare("SELECT SUM(price) as total FROM quotas WHERE status = 'sold' AND tenant_id = ?").get(req.tenantId)?.total || 0,
      pendingPayments: db.prepare("SELECT SUM(amount) as total FROM installments WHERE status = 'pending' AND tenant_id = ?").get(req.tenantId)?.total || 0,
      receivedPayments: db.prepare("SELECT SUM(amount) as total FROM installments WHERE status = 'paid' AND tenant_id = ?").get(req.tenantId)?.total || 0,
      productRevenue: db.prepare(`
        SELECT 
          p.id,
          p.name, 
          p.total_quotas,
          (SELECT COALESCE(SUM(price), 0) FROM quotas WHERE product_id = p.id AND status = 'sold' AND tenant_id = ?) as revenue
        FROM products p
        WHERE p.tenant_id = ?
      `).all(req.tenantId, req.tenantId).map((p: any) => {
        // Fetch sales details separately to avoid complex subquery issues in some SQLite versions
        const sales = db.prepare(`
          SELECT q.id, q.number, u.name as owner, u.cpf as owner_cpf
          FROM quotas q
          JOIN users u ON q.owner_id = u.id
          WHERE q.product_id = ? AND q.status = 'sold' AND q.tenant_id = ?
        `).all(p.id, req.tenantId).map((s: any) => {
          const instStats: any = db.prepare(`
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid
            FROM installments 
            WHERE quota_id = ? AND tenant_id = ?
          `).get(s.id, req.tenantId);
          
          return {
            ...s,
            paid_installments: instStats?.paid || 0,
            total_installments: instStats?.total || 0
          };
        });

        return {
          ...p,
          sales_details: sales
        };
      }),
      recentActivity: db.prepare(`
        SELECT action as title, details, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as createdAt 
        FROM audit_logs 
        WHERE tenant_id = ?
        ORDER BY created_at DESC 
        LIMIT 5
      `).all(req.tenantId),
      lastSync: new Date().toISOString()
    };
    res.json(stats);
  } catch (err) {
    console.error("Erro ao carregar estatísticas:", err);
    res.status(500).json({ error: "Erro interno ao carregar estatísticas" });
  }
});

app.get("/api/terms", authenticate, (req: any, res) => {
  const term = db.prepare("SELECT * FROM terms WHERE is_active = 1 AND tenant_id = ? ORDER BY created_at DESC LIMIT 1").get(req.tenantId);
  res.json(term || { content: `TERMO DE CIENTIFICAÇÃO E ADESÃO AO BOLÃO – ACEITE ELETRÔNICO

Ao selecionar a opção “Estou ciente e concordo”, o PARTICIPANTE declara ter lido integralmente o presente Termo de Cientificação e Adesão, manifestando concordância com todas as suas cláusulas, nos termos da legislação brasileira aplicável, especialmente da Lei nº 8.078/1990 (Código de Defesa do Consumidor), da Lei nº 13.756/2018 e da Lei nº 14.063/2020.

1. DO OBJETO

1.1. O presente termo regula a participação voluntária do PARTICIPANTE em bolão, consistente na aquisição de uma ou mais cotas de participação em apostas coletivas realizadas pela ORGANIZADORA em jogos de prognóstico numérico administrados por entidade autorizada.

1.2. Cada cota adquirida representa uma fração proporcional do valor destinado às apostas e confere ao PARTICIPANTE, caso haja premiação, direito ao rateio proporcional do prêmio líquido, de acordo com a quantidade de cotas integralmente quitadas.

2. DA NATUREZA ALEATÓRIA DAS APOSTAS

2.1. O PARTICIPANTE declara estar plenamente ciente de que as apostas realizadas no âmbito do bolão estão vinculadas a jogos de prognóstico, cujo resultado depende exclusivamente de fatores aleatórios e imprevisíveis.

2.2. A ORGANIZADORA não garante qualquer premiação, lucro ou retorno financeiro, sendo sua responsabilidade limitada à organização do bolão e à realização das apostas correspondentes às cotas adquiridas.

3. DA AQUISIÇÃO DE COTAS

3.1. O PARTICIPANTE poderá adquirir quantas cotas desejar, observada a disponibilidade definida pela ORGANIZADORA.

3.2. O valor de cada cota, o número total de cotas do bolão e as condições de pagamento serão previamente informados antes da confirmação da adesão.

3.3. A participação somente será considerada válida após a confirmação da aquisição das cotas pelo sistema utilizado pela ORGANIZADORA.

4. DO PAGAMENTO

4.1. O pagamento das cotas poderá ocorrer à vista ou de forma parcelada, conforme condições previamente informadas.

4.2. O PARTICIPANTE reconhece que a quitação integral das cotas adquiridas é condição obrigatória para manutenção do direito ao eventual rateio de premiação.

4.3. O não pagamento de qualquer parcela dentro do prazo estipulado implicará automaticamente:

I – na exclusão do PARTICIPANTE do rateio de eventual prêmio referente às cotas inadimplentes;
II – na perda do direito de participação vinculada às cotas não quitadas;
III – na possibilidade de redistribuição dessas cotas pela ORGANIZADORA.

4.4. Valores eventualmente pagos poderão ser utilizados na composição das apostas realizadas, não havendo obrigação de residência caso o participante seja excluído por inadimplência.

5. DO RATEIO DE EVENTUAL PREMIAÇÃO

5.1. Caso as apostas realizadas pelo bolão sejam contempladas com premiação, o valor recebido será rateado proporcionalmente ao número de cotas integralmente quitadas de cada participante.

5.2. O pagamento da quota-parte ocorrerá após o recebimento da premiação pela ORGANIZADORA junto à instituição responsável pela loteria oficial, como a Caixa Econômica Federal.

5.3. Eventuais tributos ou encargos legais incidentes sobre a premiação observarão a legislação vigente.

6. DAS OBRIGAÇÕES DO PARTICIPANTE

Constituem obrigações do PARTICIPANTE:

I – fornecer dados verdadeiros e atualizados no momento da adesão;
II – cumprir rigorosamente os prazos e condições de pagamento das cotas adquiridas;
III – acompanhar as informações e comunicados relativos ao bolão;
IV – respeitar integralmente as regras estabelecidas neste termo.

7. DO ACEITE ELETRÔNICO

7.1. A manifestação de concordância realizada por meio eletrônico, mediante seleção da opção “Estou ciente e concordo”, será considerada aceite válido e juridicamente vinculante, produzindo os mesmos efeitos legais de assinatura manuscrita, conforme a Lei nº 14.063/2020.

7.2. O sistema poderá registrar automaticamente informações de autenticação do aceite, incluindo, quando aplicável:
data e horário do aceite;
endereço IP do dispositivo utilizado;
identificação do participante no sistema;
registro eletrônico da concordância.

8. DISPOSIÇÕES FINAIS

8.1. O PARTICIPANTE declara ter recebido informações claras e suficientes acerca do funcionamento do bolão, compreendendo os riscos inerentes às apostas.

8.2. Eventuais omissões serão resolvidas conforme a legislação brasileira aplicável, especialmente o Código Civil Brasileiro e a Lei nº 8.078/1990 (Código de Defesa do Consumidor).

ACEITE ELETRÔNICO DO PARTICIPANTE

Ao clicar em “Estou ciente e concordo”, o PARTICIPANTE declara que leu, compreendeu e concorda integralmente com todos os termos deste documento.` });
});

app.post("/api/terms", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { content } = req.body;
  
  db.prepare("UPDATE terms SET is_active = 0 WHERE tenant_id = ?").run(req.tenantId);
  db.prepare("INSERT INTO terms (tenant_id, content, is_active) VALUES (?, ?, 1)").run(req.tenantId, content);
  
  db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    req.tenantId, req.user.id, "ATUALIZACAO_TERMOS", "Atualizou e ativou novos termos de adesão"
  );
  
  res.json({ success: true });
});

app.post("/api/terms/sign", authenticate, (req: any, res) => {
  const { productName, quotas } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = new Date().toISOString();
  
  db.prepare("UPDATE users SET signed_term_at = ?, signed_term_ip = ? WHERE id = ? AND tenant_id = ?").run(
    now, ip, req.user.id, req.tenantId
  );
  
  const details = `Usuário assinou o termo via IP ${ip}${productName ? ` para o produto ${productName} (Cotas: ${quotas})` : ''}`;
  
  db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    req.tenantId, req.user.id, "ASSINATURA_TERMO", details
  );

  // Simulate sending emails
  console.log(`[EMAIL] To Client: Termo assinado com sucesso para ${productName || 'o sistema'}.`);
  const admins = db.prepare("SELECT email FROM users WHERE role IN ('admin', 'manager')").all();
  admins.forEach(a => {
    console.log(`[EMAIL] To Admin/Manager (${a.email}): O cliente ${req.user.name} assinou o termo para ${productName || 'o sistema'}.`);
  });
  
  res.json({ success: true, signed_at: now });
});

app.get("/api/audit-logs", authenticate, (req: any, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: "Forbidden" });
  const logs = db.prepare(`
    SELECT a.id, a.user_id, a.action, a.details, strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) as created_at, u.name as userName 
    FROM audit_logs a 
    LEFT JOIN users u ON a.user_id = u.id 
    WHERE a.tenant_id = ?
    ORDER BY a.created_at DESC 
    LIMIT 100
  `).all(req.tenantId);
  res.json(logs);
});

app.post("/api/login", (req, res) => {
  const { email, password, tenantId } = req.body;
  if (!tenantId) return res.status(400).json({ error: "Tenant ID required" });

  const loginValue = email.trim();
  const loginValueLower = loginValue.toLowerCase();

  // Try to find user by email, name, or cpf
  const user = db.prepare(`
    SELECT * FROM users 
    WHERE (LOWER(email) = ? OR name = ? OR cpf = ?) 
    AND password = ? 
    AND tenant_id = ?
  `).get(loginValueLower, loginValue, loginValue, password, tenantId);

  if (!user) {
    return res.status(401).json({ error: "Credenciais inválidas ou usuário não cadastrado nesta loja" });
  }
  
  const token = jwt.sign({ 
    id: user.id, 
    role: user.role, 
    name: user.name,
    tenant_id: user.tenant_id 
  }, JWT_SECRET, { expiresIn: '24h' });
  
  db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    user.tenant_id, user.id, "LOGIN", `Usuário realizou login como ${user.role}`
  );
  
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, tenant_id: user.tenant_id, signed_term_at: user.signed_term_at, cpf: user.cpf } });
});

app.post("/api/recover-password", (req, res) => {
  const { email, tenantId } = req.body;
  if (!tenantId) return res.status(400).json({ error: "Tenant ID required" });

  const user = db.prepare("SELECT * FROM users WHERE email = ? AND tenant_id = ?").get(email, tenantId);
  if (!user) return res.status(404).json({ error: "E-mail não encontrado nesta loja" });

  // In a real app, send an email. For now, we simulate.
  res.json({ 
    success: true, 
    message: "Um link de recuperação foi enviado para o seu e-mail (Simulado)",
    debug_password: (user as any).password // Only for testing purposes as requested
  });
});

app.get("/api/my-quotas", authenticate, (req: any, res) => {
  const quotas = db.prepare(`
    SELECT q.*, p.name as productName, p.image_url as productImage
    FROM quotas q
    JOIN products p ON q.product_id = p.id
    WHERE q.owner_id = ? AND q.status = 'sold' AND q.tenant_id = ?
  `).all(req.user.id, req.tenantId);
  res.json(quotas);
});

app.get("/api/my-installments", authenticate, (req: any, res) => {
  const installments = db.prepare(`
    SELECT 
      i.id,
      i.due_date,
      i.amount,
      q.number as quotaNumbers,
      p.name as productName,
      i.status,
      i.paid_at,
      u_proc.name as processed_by_name,
      u_proc.role as processed_by_role,
      u_owner.cpf as owner_cpf
    FROM installments i
    JOIN quotas q ON i.quota_id = q.id
    JOIN products p ON q.product_id = p.id
    JOIN users u_owner ON q.owner_id = u_owner.id
    LEFT JOIN users u_proc ON i.processed_by_id = u_proc.id
    WHERE q.owner_id = ? AND i.tenant_id = ?
    ORDER BY i.due_date ASC
  `).all(req.user.id, req.tenantId);
  res.json(installments);
});

app.get("/api/installments/pending", authenticate, (req: any, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: "Forbidden" });
  
  // Condense installments by user, product and due_date
  const installments = db.prepare(`
    SELECT 
      u.name as userName,
      p.name as productName,
      i.due_date,
      SUM(i.amount) as amount,
      GROUP_CONCAT(q.number) as quotaNumbers,
      MIN(i.id) as id -- Use one of the IDs for the action
    FROM installments i
    JOIN quotas q ON i.quota_id = q.id
    JOIN products p ON q.product_id = p.id
    JOIN users u ON q.owner_id = u.id
    WHERE i.status = 'pending' AND i.tenant_id = ?
    GROUP BY u.id, p.id, i.due_date
    ORDER BY i.due_date ASC
  `).all(req.tenantId);
  res.json(installments);
});

app.post("/api/installments/:id/pay", authenticate, (req: any, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  
  // Find all installments that match the condensed criteria
  const target = db.prepare(`
    SELECT quota_id, due_date FROM installments WHERE id = ? AND tenant_id = ?
  `).get(id, req.tenantId);
  
  if (!target) return res.status(404).json({ error: "Parcela não encontrada" });

  const owner = db.prepare(`
    SELECT owner_id FROM quotas WHERE id = ? AND tenant_id = ?
  `).get(target.quota_id, req.tenantId);

  const now = new Date().toISOString();
  
  // Update all pending installments for this user, product and date
  const info = db.prepare(`
    UPDATE installments 
    SET status = 'paid', paid_at = ?, processed_by_id = ? 
    WHERE status = 'pending' 
    AND due_date = ? 
    AND tenant_id = ?
    AND quota_id IN (SELECT id FROM quotas WHERE owner_id = ? AND tenant_id = ?)
  `).run(now, req.user.id, target.due_date, req.tenantId, owner.owner_id, req.tenantId);
  
  if (info.changes > 0) {
    const client = db.prepare("SELECT name FROM users WHERE id = ? AND tenant_id = ?").get(owner.owner_id, req.tenantId);
    db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
      req.tenantId, req.user.id, "BAIXA_PARCELA", `Confirmou recebimento de R$ ${target.amount || ''} do cliente ${client?.name || owner.owner_id}`
    );
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Nenhuma parcela pendente encontrada para este critério" });
  }
});

app.get("/api/products", authenticate, (req: any, res) => {
  const products = db.prepare(`
    SELECT 
      p.id, p.name, p.description, p.image_url, p.quota_price, p.created_at, p.payment_type, p.expiration_month,
      (SELECT COUNT(*) FROM quotas q WHERE q.product_id = p.id AND q.status != 'grouped' AND q.tenant_id = ?) as total_quotas,
      (SELECT COUNT(*) FROM quotas q WHERE q.product_id = p.id AND q.status = 'available' AND q.tenant_id = ?) as available_quotas,
      (SELECT COUNT(*) FROM quotas q WHERE q.product_id = p.id AND q.status = 'sold' AND q.tenant_id = ?) as sold_quotas
    FROM products p
    WHERE p.tenant_id = ?
  `).all(req.tenantId, req.tenantId, req.tenantId, req.tenantId);
  res.json(products);
});

app.post("/api/products", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { name, description, total_quotas, quota_price, image_url, payment_type, expiration_month } = req.body;
  
  const tId = req.tenantId;
  if (!tId) return res.status(400).json({ error: "Tenant ID is required" });

  try {
    const info = db.prepare("INSERT INTO products (tenant_id, name, description, total_quotas, quota_price, image_url, payment_type, expiration_month) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      tId, name, description, Number(total_quotas), Number(quota_price), image_url, payment_type || 'installments', expiration_month || null
    );
    
    const productId = info.lastInsertRowid;
    const insertQuota = db.prepare("INSERT INTO quotas (tenant_id, product_id, number, status, price) VALUES (?, ?, ?, 'available', ?)");
    
    const transaction = db.transaction((id, price, count, tenantId) => {
      for (let i = 0; i < count; i++) {
        insertQuota.run(tenantId, id, (i + 1).toString(), price);
      }
    });
    
    transaction(productId, Number(quota_price), Number(total_quotas), tId);
    
    db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
      tId, req.user.id, "CRIACAO_PRODUTO", `Criou o produto ${name} com ${total_quotas} cotas`
    );
    
    res.json({ id: productId });
  } catch (err: any) {
    console.error("Error creating product:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/products/:id", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { name, description, image_url } = req.body;
  
  db.prepare("UPDATE products SET name = ?, description = ?, image_url = ? WHERE id = ?").run(
    name, description, image_url, id
  );
  
  db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    req.tenantId, req.user.id, "ATUALIZACAO_PRODUTO", `Atualizou o produto ID ${id}`
  );
  
  res.json({ success: true });
});

app.delete("/api/products/:id", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  
  try {
    const transaction = db.transaction(() => {
      // 1. Delete installments related to quotas of this product
      db.prepare(`
        DELETE FROM installments 
        WHERE quota_id IN (SELECT id FROM quotas WHERE product_id = ?)
      `).run(id);

      // 2. Delete chat messages related to this product
      db.prepare("DELETE FROM chat_messages WHERE product_id = ?").run(id);

      // 3. Delete quotas related to this product
      // Handle self-reference by setting parent_quota_id to NULL first
      db.prepare("UPDATE quotas SET parent_quota_id = NULL WHERE product_id = ?").run(id);
      db.prepare("DELETE FROM quotas WHERE product_id = ?").run(id);

      // 4. Delete the product itself
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
    });

    transaction();
    
    db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
      req.tenantId, req.user.id, "EXCLUSAO_PRODUTO", `Excluiu o produto ID ${id}`
    );
    
    res.json({ success: true });
  } catch (e: any) {
    console.error("Delete product error:", e);
    res.status(500).json({ error: "Erro ao excluir produto: " + e.message });
  }
});

app.post("/api/register", (req, res) => {
  const { name, email, password, role, cpf, phone, address, address_number, address_complement, address_cep, pix_key, tenantId } = req.body;
  
  if (!name || !email || !password || !cpf || !phone || !address || !address_number || !address_cep || !pix_key || !tenantId) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios." });
  }

  const emailLower = email.toLowerCase();

  try {
    const info = db.prepare("INSERT INTO users (tenant_id, name, email, password, role, cpf, phone, address, address_number, address_complement, address_cep, pix_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      tenantId, name, emailLower, password, role || 'client', cpf, phone, address, address_number, address_complement, address_cep, pix_key
    );
    
    db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
      tenantId, info.lastInsertRowid, "AUTOCADASTRO", `Novo cliente cadastrado: ${name}`
    );
    
    res.json({ id: info.lastInsertRowid });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/register-manager", (req, res) => {
  const { name, email, password, cpf, phone, address, address_number, address_complement, address_cep, pix_key, tenantId } = req.body;
  if (!tenantId) return res.status(400).json({ error: "Tenant ID required" });

  const emailLower = email.toLowerCase();

  try {
    const info = db.prepare("INSERT INTO users (tenant_id, name, email, password, role, cpf, phone, address, address_number, address_complement, address_cep, pix_key) VALUES (?, ?, ?, ?, 'manager', ?, ?, ?, ?, ?, ?, ?)").run(
      tenantId, name, emailLower, password, cpf, phone, address, address_number, address_complement, address_cep, pix_key
    );
    res.json({ id: info.lastInsertRowid });
  } catch (e: any) {
    res.status(400).json({ error: "E-mail ou nome já cadastrado nesta loja" });
  }
});

app.post("/api/register-client", (req, res) => {
  const { name, email, password, cpf, phone, address, address_number, address_complement, address_cep, pix_key, tenantId } = req.body;
  if (!tenantId) return res.status(400).json({ error: "Tenant ID required" });

  const emailLower = email.toLowerCase();

  try {
    const info = db.prepare(`
      INSERT INTO users (tenant_id, name, email, password, role, cpf, phone, address, address_number, address_complement, address_cep, pix_key) 
      VALUES (?, ?, ?, ?, 'client', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tenantId, name, emailLower, password, cpf, phone, address, address_number, address_complement, address_cep, pix_key
    );
    res.json({ id: info.lastInsertRowid });
  } catch (e: any) {
    res.status(400).json({ error: "E-mail já cadastrado nesta loja" });
  }
});

app.get("/api/users/:id/details", authenticate, (req: any, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ?").get(id, req.tenantId);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  
  const products = db.prepare(`
    SELECT p.name, COUNT(q.id) as quotaCount, SUM(q.price) as totalValue,
    (SELECT SUM(i.amount) FROM installments i WHERE i.quota_id IN (SELECT id FROM quotas WHERE product_id = p.id AND owner_id = ? AND tenant_id = ?) AND i.tenant_id = ?) as totalInstallments,
    (SELECT SUM(i.amount) FROM installments i WHERE i.quota_id IN (SELECT id FROM quotas WHERE product_id = p.id AND owner_id = ? AND tenant_id = ?) AND i.status = 'pending' AND i.tenant_id = ?) as pendingValue
    FROM products p
    JOIN quotas q ON p.id = q.product_id
    WHERE q.owner_id = ? AND q.tenant_id = ? AND p.tenant_id = ?
    GROUP BY p.id
  `).all(id, req.tenantId, req.tenantId, id, req.tenantId, req.tenantId, id, req.tenantId, req.tenantId);
  
  res.json({ user, products });
});

app.get("/api/managers", authenticate, (req: any, res) => {
  const managers = db.prepare("SELECT id, name, email FROM users WHERE (role = 'manager' OR role = 'admin') AND tenant_id = ?").all(req.tenantId);
  res.json(managers);
});

app.get("/api/users", authenticate, (req: any, res) => {
  if (req.user.role === 'client') return res.status(403).json({ error: "Forbidden" });
  
  let users;
  if (req.user.role === 'manager') {
    users = db.prepare("SELECT id, name, email, role, cpf, signed_term_at FROM users WHERE name != 'Cotamaster' AND tenant_id = ?").all(req.tenantId);
  } else {
    users = db.prepare("SELECT id, name, email, role, cpf, signed_term_at FROM users WHERE tenant_id = ?").all(req.tenantId);
  }
  res.json(users);
});

app.post("/api/users", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { name, email, password, role, cpf, pix_key } = req.body;
  
  try {
    const info = db.prepare("INSERT INTO users (tenant_id, name, email, password, role, cpf, pix_key) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      req.tenantId, name, email, password, role, cpf, pix_key
    );
    
    db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
      req.tenantId, req.user.id, "CRIACAO_USUARIO", `Criou o usuário: ${name} (${role})`
    );
    
    res.json({ id: info.lastInsertRowid });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/users/:id", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  
  // Don't allow deleting self
  if (Number(id) === req.user.id) return res.status(400).json({ error: "Você não pode excluir a si mesmo" });

  db.prepare("DELETE FROM users WHERE id = ? AND tenant_id = ?").run(id, req.tenantId);
  
  db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    req.tenantId, req.user.id, "EXCLUSAO_USUARIO", `Excluiu o usuário ID ${id}`
  );
  
  res.json({ success: true });
});

app.get("/api/products/:id/quotas", authenticate, (req: any, res) => {
  const { id } = req.params;
  const quotas = db.prepare("SELECT * FROM quotas WHERE product_id = ? AND tenant_id = ?").all(id, req.tenantId);
  res.json(quotas);
});

// Quota Reorganization
app.post("/api/quotas/:id/cancel", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  
  const quota = db.prepare("SELECT * FROM quotas WHERE id = ? AND tenant_id = ?").get(id, req.tenantId);
  if (!quota) return res.status(404).json({ error: "Cota não encontrada" });
  
  db.prepare("UPDATE quotas SET owner_id = NULL, status = 'available' WHERE id = ? AND tenant_id = ?").run(id, req.tenantId);
  
  db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    req.tenantId, req.user.id, "CANCELAMENTO_VENDA", `Cancelou a venda da cota ID ${id}`
  );
  
  res.json({ success: true });
});

app.post("/api/quotas/buy", authenticate, (req: any, res) => {
  const { quotaIds, installmentCount } = req.body;
  
  if (!quotaIds || !Array.isArray(quotaIds) || quotaIds.length === 0) {
    return res.status(400).json({ error: "Nenhuma cota selecionada" });
  }

  const count = Math.max(1, Math.min(12, Number(installmentCount) || 1));
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const maxInstallments = 12 - (currentMonth - 1);

  if (count > maxInstallments) {
    return res.status(400).json({ error: `O número máximo de parcelas permitido para este mês é ${maxInstallments}.` });
  }

  const user = db.prepare("SELECT signed_term_at FROM users WHERE id = ? AND tenant_id = ?").get(req.user.id, req.tenantId);
  if (!user.signed_term_at) {
    return res.status(403).json({ error: "Você precisa assinar o termo de adesão antes de comprar cotas." });
  }

  const transaction = db.transaction((ids, userId, instCount, tId) => {
    for (const id of ids) {
    const quota = db.prepare(`
      SELECT q.*, p.expiration_month, p.payment_type 
      FROM quotas q 
      JOIN products p ON q.product_id = p.id 
      WHERE q.id = ? AND q.tenant_id = ?
    `).get(id, tId);
    
    if (!quota) throw new Error(`Cota ${id} não encontrada`);
    if (quota.status !== 'available') throw new Error(`Cota ${id} não está disponível`);
    
    // Calculate max installments based on product expiration
    let productMaxInst = 12;
    let dueDay = 10; // Default due day
    
    if (quota.expiration_month) {
      const expDate = new Date(quota.expiration_month);
      const now = new Date();
      const diffMonths = (expDate.getFullYear() - now.getFullYear()) * 12 + (expDate.getMonth() - now.getMonth());
      productMaxInst = Math.max(1, diffMonths + 1);
      dueDay = expDate.getDate();
    }

    if (instCount > productMaxInst) {
      throw new Error(`O número máximo de parcelas para este produto é ${productMaxInst}.`);
    }

    db.prepare("UPDATE quotas SET owner_id = ?, status = 'sold' WHERE id = ? AND tenant_id = ?").run(userId, id, tId);

    // Create installments
    const installmentAmount = quota.price / instCount;
    for (let i = 0; i < instCount; i++) {
      const dueDate = new Date(now.getFullYear(), now.getMonth() + i, dueDay);
      
      db.prepare("INSERT INTO installments (tenant_id, quota_id, amount, due_date, status) VALUES (?, ?, ?, ?, ?)").run(
        tId, id, installmentAmount, dueDate.toISOString().split('T')[0], 'pending'
      );
    }
    }
  });

  try {
    transaction(quotaIds, req.user.id, count, req.tenantId);
    
    db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
      req.tenantId, req.user.id, "COMPRA_COTAS", `Comprou ${quotaIds.length} cotas em ${count} parcelas`
    );
    
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/quotas/reorganize", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  
  try {
    const { productId, quotasToGroup, subdivisionCount, customName } = req.body;
    const pId = Number(productId);
    const sCount = Number(subdivisionCount);

    if (!quotasToGroup || !Array.isArray(quotasToGroup) || quotasToGroup.length === 0) {
      return res.status(400).json({ error: "Nenhuma cota selecionada" });
    }

    if (isNaN(sCount) || sCount < 1) {
      return res.status(400).json({ error: "Quantidade de subdivisão inválida" });
    }

    const placeholders = quotasToGroup.map(() => '?').join(',');
    
    const totalValue: any = db.prepare(`SELECT SUM(price) as total FROM quotas WHERE id IN (${placeholders}) AND tenant_id = ?`).get(...quotasToGroup, req.tenantId);
    
    if (!totalValue || totalValue.total === null) {
      return res.status(400).json({ error: "Não foi possível calcular o valor das cotas selecionadas" });
    }

    const fractionPrice = totalValue.total / sCount;

    const groupedQuotasData: any[] = db.prepare(`SELECT number FROM quotas WHERE id IN (${placeholders}) AND tenant_id = ?`).all(...quotasToGroup, req.tenantId);
    const baseNumber = customName || groupedQuotasData.map(q => q.number).filter(Boolean).join(',');

    const performReorganization = db.transaction((tId) => {
      db.prepare(`UPDATE quotas SET status = 'grouped' WHERE id IN (${placeholders}) AND tenant_id = ?`).run(...quotasToGroup, tId);
      
      const insertQuota = db.prepare("INSERT INTO quotas (tenant_id, product_id, number, status, price, parent_quota_id, fraction_index, custom_name) VALUES (?, ?, ?, 'available', ?, ?, ?, ?)");
      for (let i = 0; i < sCount; i++) {
        const fractionNumber = `${baseNumber}.${i + 1}`;
        insertQuota.run(tId, pId, fractionNumber, fractionPrice, quotasToGroup[0], i + 1, customName);
      }

      db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
        tId, req.user.id, 
        "REORGANIZACAO_COTAS", 
        `Agrupou ${quotasToGroup.length} cotas e dividiu em ${sCount} frações (Nome: ${customName || 'Padrão'})`
      );
    });

    performReorganization(req.tenantId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/quotas/undo-reorganize", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  
  try {
    const { quotaIds } = req.body; // IDs of the grouped quotas to restore
    if (!quotaIds || !Array.isArray(quotaIds)) return res.status(400).json({ error: "IDs inválidos" });

    const placeholders = quotaIds.map(() => '?').join(',');

    const transaction = db.transaction((tId) => {
      // 1. Find the subdivided quotas that were created from these
      db.prepare(`DELETE FROM quotas WHERE parent_quota_id IN (${placeholders}) AND tenant_id = ?`).run(...quotaIds, tId);
      
      // 2. Restore the original quotas
      db.prepare(`UPDATE quotas SET status = 'available' WHERE id IN (${placeholders}) AND tenant_id = ?`).run(...quotaIds, tId);

      db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
        tId, req.user.id, 
        "DESFAZER_REORGANIZACAO", 
        `Desfez o agrupamento de ${quotaIds.length} cotas`
      );
    });

    transaction(req.tenantId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/products/:id/chat", authenticate, (req: any, res) => {
  const { id } = req.params;
  const messages = db.prepare(`
    SELECT m.message, m.created_at as createdAt, u.name as userName, m.mention_user_id as mentionUserId
    FROM chat_messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.product_id = ? AND m.tenant_id = ?
    ORDER BY m.created_at ASC
    LIMIT 100
  `).all(id, req.tenantId);
  
  res.json(messages.map((m: any) => ({
    ...m,
    userName: m.userName.split(" ")[0]
  })));
});

app.put("/api/tenants/:id", authenticate, (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { name, cnpj, image_url } = req.body;

  if (parseInt(id) !== req.tenantId) return res.status(403).json({ error: "Forbidden: Cannot manage other tenants" });

  db.prepare("UPDATE tenants SET name = ?, cnpj = ?, image_url = ? WHERE id = ?").run(name, cnpj, image_url, id);
  
  db.prepare("INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?, ?, ?, ?)").run(
    req.tenantId, req.user.id, "ATUALIZACAO_LOJA", `Atualizou informações da loja: ${name}`
  );

  res.json({ success: true });
});

// Socket.io for Chat
io.on("connection", (socket) => {
  socket.on("join_room", (productId) => {
    socket.join(`product_${productId}`);
  });

  socket.on("send_message", (data) => {
    try {
      const { productId, userId, userName, message, mentionUserId, tenantId } = data;
      
      if (!tenantId) {
        console.error("tenant_id não definido no evento send_message");
        return;
      }

      // Simple filter
      const forbiddenWords = ["badword1", "badword2"];
      let filteredMessage = message;
      forbiddenWords.forEach(word => {
        const reg = new RegExp(word, "gi");
        filteredMessage = filteredMessage.replace(reg, "***");
      });

      db.prepare("INSERT INTO chat_messages (tenant_id, product_id, user_id, message, mention_user_id) VALUES (?, ?, ?, ?, ?)").run(
        tenantId, productId, userId, filteredMessage, mentionUserId || null
      );

      io.to(`product_${productId}`).emit("receive_message", {
        userName: userName.split(" ")[0], // Only first name
        message: filteredMessage,
        mentionUserId: mentionUserId || null,
        createdAt: new Date()
      });
    } catch (err) {
      console.error("Erro ao processar mensagem de chat:", err);
    }
  });
});

const __dirname = new URL('.', import.meta.url).pathname;

app.use(express.static(path.join(__dirname, "dist")));

// Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
