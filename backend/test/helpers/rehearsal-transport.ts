import type { RehearsalRequest, RehearsalResponse, RehearsalTransport } from '../../src/services/rehearsal-client';

export type RecordedRequest = RehearsalRequest;

/**
 * A scriptable stand-in for the loopback transport.
 *
 * Lets a unit test drive the stage machine without a listening socket, and —
 * more usefully — lets it make one specific endpoint misbehave, which is how
 * the "failure is attributed to the right stage" requirement gets tested.
 */
export class FakeTransport {
  readonly requests: RecordedRequest[] = [];
  private readonly overrides = new Map<string, RehearsalResponse>();

  constructor(private readonly base: (request: RehearsalRequest) => RehearsalResponse) {}

  /** Force a response for `METHOD path`, e.g. `POST /user/exam/key`. */
  override(key: string, response: RehearsalResponse): this {
    this.overrides.set(key, response);
    return this;
  }

  /**
   * Force a response only when the request matches.
   *
   * Needed wherever one path carries several meanings — `POST /admin/exam-state`
   * drives every transition, so failing it outright never reaches the later
   * ones.
   */
  private readonly conditional: Array<{ key: string; when: (request: RehearsalRequest) => boolean; respond: () => RehearsalResponse }> = [];

  /**
   * `respond` is a factory, not a value: a reply that has to be encrypted with
   * the key the client registered cannot be built before the handshake.
   */
  overrideWhen(key: string, when: (request: RehearsalRequest) => boolean, respond: RehearsalResponse | (() => RehearsalResponse)): this {
    this.conditional.push({ key, when, respond: typeof respond === 'function' ? respond : () => respond });
    return this;
  }

  get fn(): RehearsalTransport {
    return async (request) => {
      this.requests.push({ ...request });
      const key = `${request.method} ${request.path}`;
      const conditional = this.conditional.find((rule) => rule.key === key && rule.when(request));
      if (conditional) return conditional.respond();
      const forced = this.overrides.get(key);
      if (forced) return forced;
      return this.base(request);
    };
  }

  /** Paths seen, in order — for asserting a stage stopped where it should. */
  get paths(): string[] {
    return this.requests.map((request) => `${request.method} ${request.path}`);
  }
}

export const json = (status: number, body: unknown): RehearsalResponse => ({
  status,
  body,
  text: JSON.stringify(body),
});
