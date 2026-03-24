import { z } from 'zod';

export const udhaarChargeSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().gt(0),
  referenceType: z.string().trim().min(1).max(40).default('manual'),
  referenceId: z.string().uuid().optional(),
  notes: z.string().trim().max(300).optional(),
});

export const udhaarPaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().gt(0),
  method: z.enum(['cash', 'bank', 'wallet']).default('cash'),
  notes: z.string().trim().max(300).optional(),
});
