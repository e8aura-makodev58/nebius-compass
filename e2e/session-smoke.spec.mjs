import { test, expect } from '@playwright/test';
test('session probe reports signed out without exposing credentials', async ({ request }) => {
  const response = await request.get('/api/session');
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: 'Sign in required' });
  expect(response.headers()['cache-control']).toBe('no-store');
});
