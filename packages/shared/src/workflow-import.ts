import { z } from 'zod';
import { confirmedItemSchema } from './schemas.js';
import { workflowDateSchema } from './workflow.js';

/** Keep physical source rows, including repeated names, when creating a request. */
export const workflowImportConfirmSchema = z.object({
  taskId: z.string().trim().min(1).max(64),
  version: z.number().int().nonnegative(),
  operationId: z.string().uuid().optional(),
  serialNumber: z.string().trim().min(1).max(64),
  department: z.string().trim().min(1).max(64),
  handler: z.string().trim().min(1).max(64),
  requestDate: workflowDateSchema,
  supplierId: z.coerce.number().int().positive().nullish(),
  items: z.array(confirmedItemSchema.extend({ unit: z.string().trim().min(1, '请确认原件单位').max(16) })).min(1).max(500),
});
export type WorkflowImportConfirmInput = z.infer<typeof workflowImportConfirmSchema>;
