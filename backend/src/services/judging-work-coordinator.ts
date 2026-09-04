export type DeployAdmissionBlock = "student_judging_active" | "deploy_test_active" | "deploy_test_draining";

export interface WorkLease { release(): void }

export class JudgingWorkCoordinator {
  private static students = 0;
  private static deploy = false;
  private static draining = false;

  private static lease(onRelease: () => void): WorkLease {
    let released = false;
    return { release: () => { if (!released) { released = true; onRelease(); } } };
  }

  static acquireStudent(): WorkLease | null {
    if (this.deploy || this.draining) return null;
    this.students += 1;
    return this.lease(() => { this.students = Math.max(0, this.students - 1); });
  }

  static acquireDeploy(): { lease?: WorkLease; reason?: DeployAdmissionBlock } {
    if (this.deploy) return { reason: "deploy_test_active" };
    if (this.draining) return { reason: "deploy_test_draining" };
    if (this.students > 0) return { reason: "student_judging_active" };
    this.deploy = true;
    return { lease: this.lease(() => { this.deploy = false; }) };
  }

  static beginDraining(lease: WorkLease): void {
    this.draining = true;
    lease.release();
  }

  static endDraining(): void { this.draining = false; }
  static hasStudentWork(): boolean { return this.students > 0; }
  static hasDeployWork(): boolean { return this.deploy; }
  static isDraining(): boolean { return this.draining; }
  static reset(): void { this.students = 0; this.deploy = false; this.draining = false; }
}
