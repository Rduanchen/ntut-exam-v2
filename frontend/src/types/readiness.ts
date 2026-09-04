export type ExamPhase =
  | 'UNINITIALIZED'
  | 'INITIALIZED'
  | 'SETUP_FINISHED'
  | 'IN_PROGRESS'
  | 'FINISHED';

export type EnvironmentCheckStatus = 'UNKNOWN' | 'RUNNING' | 'PASSED' | 'FAILED';

/**
 * One seat, as the invigilator needs to read it.
 *
 * `ready` is derived by the backend from the other fields rather than stored,
 * so it cannot disagree with them. The individual conditions come along too:
 * knowing a seat is not ready is only useful with the reason attached.
 */
export interface StudentReadiness {
  testId: string;
  name: string;
  ipAddress: string | null;
  deviceUuid: string | null;
  isRegistered: boolean;
  isOnline: boolean;
  isLoggedIn: boolean;
  envCheckStatus: EnvironmentCheckStatus;
  envCheckFailedLanguages: string[];
  envCheckReportedAt: string | null;
  lastDisconnectedAt: string | null;
  ready: boolean;
}

export interface ReadinessSummary {
  total: number;
  ready: number;
  loggedIn: number;
  registered: number;
  environmentFailed: number;
}

export interface ReadinessReport {
  phase: ExamPhase;
  isSettlingPhase: boolean;
  summary: ReadinessSummary;
  students: StudentReadiness[];
}
