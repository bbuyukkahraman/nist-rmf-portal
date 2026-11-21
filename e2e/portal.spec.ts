import { test, expect } from '@playwright/test';

test('health endpoint', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});

test('register, create system, baseline, update control', async ({ request }) => {
  const email = `e2e-${Date.now()}@test.com`;
  const reg = await request.post('/api/auth/register-tenant', {
    data: { tenantName: 'E2E Tenant', adminEmail: email, adminName: 'E2E', adminPassword: 'E2Epass123!' },
  });
  expect(reg.ok()).toBeTruthy();
  const { token } = await reg.json();

  const sysRes = await request.post('/api/systems', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'E2E System', impactC: 'moderate', impactI: 'moderate', impactA: 'moderate' },
  });
  expect(sysRes.ok()).toBeTruthy();
  const { id: sysId } = await sysRes.json();

  const baseRes = await request.post(`/api/systems/${sysId}/baseline`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(baseRes.ok()).toBeTruthy();
  const base = await baseRes.json();
  expect(base.controlsCreated).toBeGreaterThan(0);

  const ctrlRes = await request.get(`/api/systems/${sysId}/controls`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { items } = await ctrlRes.json();
  expect(items.length).toBeGreaterThan(0);

  const upd = await request.patch(`/api/controls/${items[0].id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'implemented' },
  });
  expect(upd.ok()).toBeTruthy();
});

test('dashboard returns stats', async ({ request }) => {
  const email = `e2e2-${Date.now()}@test.com`;
  const reg = await request.post('/api/auth/register-tenant', {
    data: { tenantName: 'E2E2', adminEmail: email, adminName: 'E2E2', adminPassword: 'E2Epass123!' },
  });
  const { token } = await reg.json();
  const res = await request.get('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(typeof body.systems).toBe('number');
});
