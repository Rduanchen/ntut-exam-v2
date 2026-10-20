import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';

describe('separate API listeners', () => {
  it('mounts admin routes only on the admin app', async () => {
    const admin = createApp('admin');
    const token = process.env.ADMIN_TOKEN!;
    expect((await request(admin).get('/admin/system-info').set('x-admin-token', token)).status).toBe(200);
    expect((await request(admin).get('/user/auth/rsa-public-key')).status).toBe(404);
  });

  it('mounts user routes only on the user app', async () => {
    const user = createApp('user');
    expect((await request(user).get('/user/auth/rsa-public-key')).status).not.toBe(404);
    expect((await request(user).get('/admin/system-info').set('x-admin-token', process.env.ADMIN_TOKEN!)).status).toBe(404);
  });
});
