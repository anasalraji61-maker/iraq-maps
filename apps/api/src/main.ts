import { apiConfig, createApp } from './app';

const app = await createApp({ logger: true });
app.enableShutdownHooks();
await app.listen({ port: apiConfig().API_PORT, host: '0.0.0.0' });
