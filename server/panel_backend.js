const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const upload = multer({ dest: 'uploads/' });

const USERS_DIR = './server/users';
fs.mkdirSync(USERS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static('../')); // servir frontend básico

// Upload de ZIP
app.post('/upload/:user', upload.single('file'), async (req, res) => {
  const userDir = `${USERS_DIR}/${req.params.user}/app`;
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.mkdirSync(userDir, { recursive: true });

  fs.createReadStream(req.file.path)
    .pipe(unzipper.Extract({ path: userDir }))
    .on('close', () => {
      if(fs.existsSync(`${userDir}/package.json`)) {
        exec(`cd ${userDir} && npm install`, (err, stdout, stderr) => {
          if(err) return res.status(500).send(stderr);
          res.send('Upload feito e dependências instaladas!');
        });
      } else {
        res.send('Upload feito!');
      }
    });
});

// Start do app
app.post('/start/:user', (req, res) => {
  const userDir = `${USERS_DIR}/${req.params.user}/app`;
  if(!fs.existsSync(userDir)) return res.status(404).send('App não encontrado');
  exec(`pm2 start ${userDir}/app.js --name "${req.params.user}" --max-memory-restart 512M`, (err, stdout, stderr) => {
    if(err) return res.status(500).send(stderr);
    res.send('App iniciado!');
  });
});

// Stop do app
app.post('/stop/:user', (req, res) => {
  exec(`pm2 stop ${req.params.user}`, (err, stdout, stderr) => {
    if(err) return res.status(500).send(stderr);
    res.send('App parado!');
  });
});

// Listar arquivos
app.get('/list/:user', (req, res) => {
  const userDir = `${USERS_DIR}/${req.params.user}/app`;
  if(!fs.existsSync(userDir)) return res.status(404).send('App não encontrado');
  res.json(fs.readdirSync(userDir));
});

app.listen(${NODE_PORT}, () => console.log(`Backend rodando na porta ${NODE_PORT}`));
