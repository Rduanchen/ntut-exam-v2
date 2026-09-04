import { describe, expect, it, vi } from 'vitest';
import { downloadJson } from '../src/utils/download-json';

describe('JSON report download', () => {
  it('uses JSON MIME, requested filename, one click, and always revokes the URL', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadJson({ run: 1 }, 'judger-deploy-test-run-1.json');
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((create.mock.calls[0][0] as Blob).type).toBe('application/json');
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
