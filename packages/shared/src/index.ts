import { z } from 'zod';

export const Role = z.enum([
  'platform_admin',
  'tenant_admin',
  'isso',
  'system_owner',
  'assessor',
  'auditor',
  'ao',
]);
export type Role = z.infer<typeof Role>;

export const ImpactLevel = z.enum(['low', 'moderate', 'high']);
export type ImpactLevel = z.infer<typeof ImpactLevel>;

export const ControlStatus = z.enum(['not_assessed', 'implemented', 'partially', 'alternative', 'not_applicable']);
export type ControlStatus = z.infer<typeof ControlStatus>;

export const AuthDecision = z.enum(['ato', 'dato', 'iato']);
export type AuthDecision = z.infer<typeof AuthDecision>;

export const PoamStatus = z.enum(['open', 'closed_pending_verification', 'closed']);
export type PoamStatus = z.infer<typeof PoamStatus>;

export const SystemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  owner: z.string().optional(),
  impactC: ImpactLevel,
  impactI: ImpactLevel,
  impactA: ImpactLevel,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type System = z.infer<typeof SystemSchema>;

export const ControlSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  controlId: z.string(),
  family: z.string(),
  title: z.string(),
  status: ControlStatus,
  implementation: z.string().optional(),
  evidenceKey: z.string().optional(),
  updatedAt: z.string(),
});
export type Control = z.infer<typeof ControlSchema>;

export const AssessmentSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  assessedAt: z.string(),
  assessor: z.string(),
  summary: z.string(),
  findings: z.array(z.object({ controlId: z.string(), rating: z.string(), note: z.string().optional() })),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const PoamSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  controlId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  owner: z.string(),
  dueDate: z.string(),
  status: PoamStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Poam = z.infer<typeof PoamSchema>;

export const AuthorizationSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  decision: AuthDecision,
  decidedBy: z.string(),
  decidedAt: z.string(),
  expiry: z.string(),
  conditions: z.string().optional(),
});
export type Authorization = z.infer<typeof AuthorizationSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  actor: z.string(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().optional(),
  timestamp: z.string(),
  hash: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const ErrorEnvelope = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
});
