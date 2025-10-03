const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ dest: "uploads/" });
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ ok: true, file: req.file });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  console.log("✅ Novo cliente conectado ao console!");
  socket.on("cmd", (data) => {
    const shell = spawn("bash", ["-c", data]);

    shell.stdout.on("data", (out) => {
      socket.emit("console", out.toString());
    });

    shell.stderr.on("data", (err) => {
      socket.emit("console", `⚠️ Erro: ${err}`);
    });

    shell.on("close", (code) => {
      socket.emit("console", `✅ Processo finalizado (code ${code})`);
    });
  });
});

server.listen(3000, () => {
  console.log("🚀 Painel rodando em http://localhost:3000");
});

