export type DeployAdmissionBlock = "student_judging_active" | "deploy_test_active" | "deploy_test_draining" | "rehearsal_active";
export type RehearsalAdmissionBlock = "student_judging_active" | "deploy_test_active" | "deploy_test_draining" | "rehearsal_active";

export interface WorkLease { release(): void }

export class JudgingWorkCoordinator {
  private static students = 0;
  private static deploy = false;
  private static rehearsal = false;
  private static draining = false;

  private static lease(onRelease: () => void): WorkLease {
    let released = false;
    return { release: () => { if (!released) { released = true; onRelease(); } } };
  }

  /**
   * Admit student judging.
   *
   * Deliberately NOT blocked by `rehearsal`. During a rehearsal there can be no
   * real student judging to exclude — a rehearsal only starts when the user
   * table is empty and the exam is uninitialised, and it drives every phase
   * transition itself, so no real device can register, log in or submit while
   * it runs. The only caller that can reach this during a rehearsal is the
   * rehearsal's own grading stage, going through `JudgeQueueService` exactly as
   * a TA's button does.
   *
   * Blocking here instead would make the rehearsal deadlock against itself at
   * the one stage it most needs to exercise.
   */
  static acquireStudent(): WorkLease | null {
    if (this.deploy || this.draining) return null;
    this.students += 1;
    return this.lease(() => { this.students = Math.max(0, this.students - 1); });
  }

  static acquireDeploy(): { lease?: WorkLease; reason?: DeployAdmissionBlock } {
    if (this.deploy) return { reason: "deploy_test_active" };
    if (this.rehearsal) return { reason: "rehearsal_active" };
    if (this.draining) return { reason: "deploy_test_draining" };
    if (this.students > 0) return { reason: "student_judging_active" };
    this.deploy = true;
    return { lease: this.lease(() => { this.deploy = false; }) };
  }

  /**
   * Admit a post-deployment rehearsal.
   *
   * Mutually exclusive with the deploy test in both directions: the two share
   * one execution backend, and a rehearsal whose grading stage competes with a
   * concurrency sweep measures neither of them.
   */
  static acquireRehearsal(): { lease?: WorkLease; reason?: RehearsalAdmissionBlock } {
    if (this.rehearsal) return { reason: "rehearsal_active" };
    if (this.deploy) return { reason: "deploy_test_active" };
    if (this.draining) return { reason: "deploy_test_draining" };
    if (this.students > 0) return { reason: "student_judging_active" };
    this.rehearsal = true;
    return { lease: this.lease(() => { this.rehearsal = false; }) };
  }

  static beginDraining(lease: WorkLease): void {
    this.draining = true;
    lease.release();
  }

  static endDraining(): void { this.draining = false; }
  static hasStudentWork(): boolean { return this.students > 0; }
  static hasDeployWork(): boolean { return this.deploy; }
  static hasRehearsalWork(): boolean { return this.rehearsal; }
  static isDraining(): boolean { return this.draining; }
  static reset(): void { this.students = 0; this.deploy = false; this.rehearsal = false; this.draining = false; }
}
