import { z } from 'zod';
import { config } from '../../config/src/index.ts';
export const contracts = z.literal(config);
