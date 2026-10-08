import { createApp } from './app';

const app = await createApp({ logger: true });
await app.listen({ port: Number(process.env.API_PORT || 3000), host: '0.0.0.0' });
