const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes — static files are served by nginx in Docker; no express.static needed.
app.use('/api/ratings', require('./routes/ratings'));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
