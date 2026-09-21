import { Table, Column, Model, DataType, HasOne } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "device_key_maps", timestamps: false })
export class DeviceKeyMap extends Model {
  @Column({ type: DataType.STRING, primaryKey: true })
  declare deviceUuid: string;

  @Column(DataType.STRING)
  declare ipAddress: string;

  @Column(DataType.STRING)
  declare clientAesKey: string;

  @Column(DataType.STRING)
  declare socketId: string;

  @Column({ field: "is_online", type: DataType.BOOLEAN, defaultValue: false })
  declare isOnline: boolean;

  @Column({ type: DataType.ENUM("UNBOUND", "AWAITING_LOGIN", "ONLINE"), defaultValue: "UNBOUND" })
  declare status: string;

  @Column({ field: "test_id", type: DataType.STRING, allowNull: true })
  declare testId: string | null;

  @Column({ field: "created_at", type: DataType.DATE, defaultValue: DataType.NOW })
  declare createdAt: Date;

  /* Feature 007. The environment check runs on the machine, in the phase
   * before students arrive. Its verdict was previously visible only on that
   * machine, so the invigilator's console could say whether a student had
   * logged in but not whether the machine could run the exam at all. */
  @Column({
    field: "env_check_status",
    type: DataType.ENUM("UNKNOWN", "RUNNING", "PASSED", "FAILED"),
    defaultValue: "UNKNOWN"
  })
  declare envCheckStatus: string;

  /** Language names only — never the compiler output, which is unbounded. */
  @Column({ field: "env_check_failed_languages", type: DataType.TEXT, allowNull: true })
  declare envCheckFailedLanguages: string | null;

  @Column({ field: "env_check_reported_at", type: DataType.DATE, allowNull: true })
  declare envCheckReportedAt: Date | null;

  /** Lets a TA judge how long ago a re-entry request's machine dropped off. */
  @Column({ field: "last_disconnected_at", type: DataType.DATE, allowNull: true })
  declare lastDisconnectedAt: Date | null;

  @HasOne(() => User)
  declare user: User;
}
