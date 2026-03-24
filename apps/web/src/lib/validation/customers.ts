import { z } from 'zod';

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  openingBalance: z.number().default(0),
});

export const customerUpdateSchema = customerCreateSchema.partial();
