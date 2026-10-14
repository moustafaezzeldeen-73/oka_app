import { createApp } from './app.js';
import { startJobs } from './services/jobs.js';

/**
 * Starts the OKA order service. Environment: see .env.example.
 * The app itself is assembled in app.js; background jobs in services/jobs.js.
 */
const port = Number(process.env.PORT ?? 8787);
createApp().listen(port, () => {
  startJobs();
  console.log(`OKA order service listening on :${port}`);
});
