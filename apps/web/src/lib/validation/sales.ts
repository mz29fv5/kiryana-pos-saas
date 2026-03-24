import { z } from 'zod';

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  productNameSnapshot: z.string().trim().min(1).max(150),
  unit: z.enum(['unit', 'kg', 'g', 'l', 'ml', 'pack']),
  qty: z.number().gt(0),
  unitPrice: z.number().min(0),
  lineDiscount: z.number().min(0).default(0),
});

export const saleCreateSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  discountTotal: z.number().min(0).default(0),
  paidAmount: z.number().min(0).default(0),
  changeAmount: z.number().min(0).default(0),
  soldAt: z.string().datetime().optional(),
  items: z.array(saleItemSchema).min(1),
});

export const saleListQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
