const express = require('express');
const app = express();

app.get('/system_stats', (req, res) => {
  console.log('Got /system_stats request', req.headers);
  res.json({ system: { os: "mock" } });
});

app.listen(8188, () => {
  console.log('Mock ComfyUI running on port 8188');
});
