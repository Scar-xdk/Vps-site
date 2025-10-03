const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(fileUpload());
app.use(express.static(__dirname));

app.post('/upload', async (req, res) => {
  if(!req.files || !req.files.zip) return res.status(400).json({error:'No file uploaded'});
  let zip = req.files.zip;
  let savePath = path.join(__dirname, zip.name);
  await zip.mv(savePath);
  res.json({message:'Arquivo salvo', path: savePath});
});

app.post('/run', (req,res)=>{
  let cmd = req.body.cmd;
  if(!cmd) return res.status(400).json({error:'Sem comando'});
  exec(cmd, {cwd: __dirname}, (err, stdout, stderr)=>{
    if(err) return res.status(500).json({error: err.message});
    res.json({stdout, stderr});
  });
});

const PORT = 3000;
app.listen(PORT,()=>console.log("Backend rodando em http://localhost:"+PORT));
