// server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.resolve(__dirname, 'users.json');
const SERVERS_FILE = path.resolve(__dirname, 'servers.json');

app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// SESSION - NÃO use MemoryStore em produção; trocar por RedisStore em produção
app.use(session({
  secret: process.env.SECRET_SESSION || 'troqueisso_por_uma_senha_grande',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false } // em produção: secure:true (https)
}));

app.use(express.static(path.join(__dirname, 'public')));

/* ---------- Helpers ---------- */
async function fileReadOrCreate(filePath, defaultContent) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw || defaultContent);
  } catch (err) {
    await fs.writeFile(filePath, defaultContent, { mode: 0o600 });
    return JSON.parse(defaultContent);
  }
}

async function saveJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/* ---------- Auth Middleware ---------- */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

/* ---------- Auth Routes ---------- */
// register
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

  const users = await fileReadOrCreate(USERS_FILE, '[]');
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), email, passwordHash: hash, createdAt: new Date().toISOString() };
  users.push(user);
  await saveJson(USERS_FILE, users);

  // auto login
  req.session.userId = user.id;
  req.session.email = user.email;
  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

// login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const users = await fileReadOrCreate(USERS_FILE, '[]');
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: 'Invalid credentials' });

  req.session.userId = user.id;
  req.session.email = user.email;
  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

// logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ---------- Server management (create/config/start/stop/logs) ---------- */
/*
 servers.json item structure:
 {
   id, ownerId, name, lang: 'python'|'node'|'php', version, startCommand, hasDeps, createdAt, status
 }
*/
app.post('/api/servers', requireAuth, async (req, res) => {
  const { name, lang, version, startCommand, hasDeps } = req.body;
  if (!name || !lang || !startCommand) return res.status(400).json({ error: 'Missing fields' });

  // sanitize name: allow only [a-zA-Z0-9-_]
  if (!/^[\w\-]{1,64}$/.test(name)) return res.status(400).json({ error: 'Invalid name' });

  const servers = await fileReadOrCreate(SERVERS_FILE, '[]');
  const id = uuidv4();
  const serverEntry = {
    id,
    ownerId: req.session.userId,
    name,
    lang,
    version: version || '',
    startCommand,
    hasDeps: !!hasDeps,
    createdAt: new Date().toISOString(),
    status: 'stopped',
    logPath: path.resolve(__dirname, 'server_data', id + '.log')
  };
  servers.push(serverEntry);
  await saveJson(SERVERS_FILE, servers);

  // ensure log dir exists
  await fs.mkdir(path.resolve(__dirname, 'server_data'), { recursive: true });
  await fs.writeFile(serverEntry.logPath, `# Server ${name} logs\n`, { flag: 'a' });

  res.json({ ok: true, server: serverEntry });
});

app.get('/api/servers', requireAuth, async (req, res) => {
  const servers = await fileReadOrCreate(SERVERS_FILE, '[]');
  const my = servers.filter(s => s.ownerId === req.session.userId);
  res.json({ ok: true, servers: my });
});

// START server (spawns process) - **VERY IMPORTANT**: spawn under restricted commands
const runningProcs = {}; // id -> child

app.post('/api/servers/:id/start', requireAuth, async (req, res) => {
  const id = req.params.id;
  const servers = await fileReadOrCreate(SERVERS_FILE, '[]');
  const server = servers.find(s => s.id === id && s.ownerId === req.session.userId);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (runningProcs[id]) return res.status(400).json({ error: 'Already running' });

  // ONLY allow pre-approved start commands per language to avoid arbitrary execution
  // Example: startCommand must be a single token or within permitted patterns.
  // For a simple approach, we restrict to these forms:
  // - node index.js
  // - python3 main.py
  // - php -S 127.0.0.1:PORT -t public
  const cmd = server.startCommand.trim();
  const allowedPatterns = [
    /^node(\s+[\w\-.\/]+\.js)?(?:\s.*)?$/,
    /^python3(\s+[\w\-.\/]+\.py)?(?:\s.*)?$/,
    /^php(\s+.*)?$/
  ];
  if (!allowedPatterns.some(r => r.test(cmd))) {
    return res.status(400).json({ error: 'Start command not allowed' });
  }

  // spawn the process in a dedicated working dir: ./user_servers/<id>
  const workDir = path.resolve(__dirname, 'user_servers', id);
  await fs.mkdir(workDir, { recursive: true, mode: 0o700 });

  // For safety: do NOT run as root. Ensure system user exists and chown in real deploy.
  const parts = cmd.split(/\s+/);
  const bin = parts.shift();
  const args = parts;

  try {
    const outStream = await fs.open(server.logPath, 'a');
    const child = spawn(bin, args, {
      cwd: workDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
      // In production, set uid/gid to an unprivileged user
    });

    child.stdout.on('data', async (data) => {
      await outStream.write(data);
    });
    child.stderr.on('data', async (data) => {
      await outStream.write(data);
    });
    child.on('close', async (code) => {
      // update status
      const servers2 = await fileReadOrCreate(SERVERS_FILE, '[]');
      const s2 = servers2.find(x => x.id === id);
      if (s2) s2.status = 'stopped';
      await saveJson(SERVERS_FILE, servers2);
      delete runningProcs[id];
      await outStream.write(`# process exited with ${code}\n`);
      await outStream.close();
    });

    runningProcs[id] = child;
    server.status = 'running';
    await saveJson(SERVERS_FILE, servers);

    res.json({ ok: true, msg: 'started' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start' });
  }
});

app.post('/api/servers/:id/stop', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!runningProcs[id]) return res.status(400).json({ error: 'Not running' });
  try {
    runningProcs[id].kill('SIGTERM');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop' });
  }
});

app.get('/api/servers/:id/logs', requireAuth, async (req, res) => {
  const id = req.params.id;
  const servers = await fileReadOrCreate(SERVERS_FILE, '[]');
  const server = servers.find(s => s.id === id && s.ownerId === req.session.userId);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    const log = await fs.readFile(server.logPath, 'utf8');
    res.json({ ok: true, log });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

/* ---------- Start server ---------- */
app.listen(PORT, () => {
  console.log(`Panel running on port ${PORT}`);
});

