import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { verifyAdminToken, requirePermission } from '../../../src/middlewares/admin.middleware';
import { HttpError } from '../../../src/utils/http-error';

const mockReq = (overrides: Partial<Request> = {}) => ({ headers: {}, ...overrides }) as Request;
const mockRes = () => ({}) as Response;

describe('admin middleware', () => {
  describe('verifyAdminToken', () => {
    it('accepts a matching x-admin-token header', () => {
      const req = mockReq({ headers: { 'x-admin-token': process.env.ADMIN_TOKEN } as any });
      const next = vi.fn() as unknown as NextFunction;

      verifyAdminToken(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).admin.role).toBe('SUPER_ADMIN');
    });

    it('accepts a matching Bearer authorization header', () => {
      const req = mockReq({ headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } as any });
      const next = vi.fn() as unknown as NextFunction;

      verifyAdminToken(req, mockRes(), next);

      expect((req as any).admin).toBeDefined();
    });

    it('rejects a missing token with 401', () => {
      const next = vi.fn() as unknown as NextFunction;

      verifyAdminToken(mockReq(), mockRes(), next);

      expect((next as any).mock.calls[0][0]).toBeInstanceOf(HttpError);
      expect((next as any).mock.calls[0][0].statusCode).toBe(401);
    });

    it('rejects an incorrect token with 401', () => {
      const req = mockReq({ headers: { 'x-admin-token': 'nope' } as any });
      const next = vi.fn() as unknown as NextFunction;

      verifyAdminToken(req, mockRes(), next);

      expect((next as any).mock.calls[0][0].statusCode).toBe(401);
    });
  });

  describe('requirePermission', () => {
    /*
     * This 403 branch is unreachable over HTTP: verifyAdminToken always injects
     * role SUPER_ADMIN, and requirePermission short-circuits on that role. It is
     * therefore unit-tested directly rather than claimed as integration coverage.
     */
    it('rejects when no admin identity is present', () => {
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('RESET_DEVICE')(mockReq(), mockRes(), next);

      expect((next as any).mock.calls[0][0].statusCode).toBe(401);
    });

    it('allows SUPER_ADMIN regardless of the listed permissions', () => {
      const req = mockReq();
      (req as any).admin = { id: 'a', role: 'SUPER_ADMIN', permissions: [] };
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('ANYTHING')(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
    });

    it('allows a non-super admin holding the required permission', () => {
      const req = mockReq();
      (req as any).admin = { id: 'a', role: 'TA', permissions: ['RESET_DEVICE'] };
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('RESET_DEVICE')(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects a non-super admin lacking the required permission with 403', () => {
      const req = mockReq();
      (req as any).admin = { id: 'a', role: 'TA', permissions: ['SOMETHING_ELSE'] };
      const next = vi.fn() as unknown as NextFunction;

      requirePermission('RESET_DEVICE')(req, mockRes(), next);

      const err = (next as any).mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect(err.statusCode).toBe(403);
      expect(err.message).toContain('RESET_DEVICE');
    });
  });
});
