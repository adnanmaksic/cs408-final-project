const path = require('path');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.static(path.join(__dirname, 'public')));

// Used by deploy/deploy.sh to confirm the server is up.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
