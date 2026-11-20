import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();
const port = Number(process.env.PORT || 4000);
createApp().listen(port, () => console.log(`IBT Travels CRM API running on http://localhost:${port}`));
