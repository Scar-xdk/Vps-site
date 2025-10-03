const express = require('express');
const app = express();

app.get('/api/ip', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    res.json({
        ip: ip,
        message: "API funcionando!"
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
