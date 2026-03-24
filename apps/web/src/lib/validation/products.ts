import { z } from 'zod';

export const productCreateSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  barcode: z.string().trim().min(1).max(60).optional(),
  nameEn: z.string().trim().min(1).max(150),
  nameUr: z.string().trim().max(150).optional(),
  unit: z.enum(['unit', 'kg', 'g', 'l', 'ml', 'pack']),
  salePrice: z.number().min(0),
  costPrice: z.number().min(0).default(0),
  stockQty: z.number().default(0),
  lowStockThreshold: z.number().default(0),
  isActive: z.boolean().default(true),
});

export const productUpdateSchema = productCreateSchema.partial();
