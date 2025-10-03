import express from "express";
import http from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

