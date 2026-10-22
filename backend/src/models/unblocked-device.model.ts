import { Table, Column, Model, DataType } from "sequelize-typescript";

export type EntryApprovalMode = "SAME_USER" | "NEW_USER";

@Table({ tableName: "unblocked_devices", timestamps: false })
export class UnblockedDevice extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @Column({ type: DataType.ENUM("IP", "UUID"), allowNull: false })
  declare targetType: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare targetValue: string;

  /** Entry approval for one UUID. Null on legacy passes, which grant no entry. */
  @Column({ field: "approval_mode", type: DataType.STRING, allowNull: true })
  declare approvalMode: EntryApprovalMode | null;

  @Column({ field: "expected_test_id", type: DataType.STRING, allowNull: true })
  declare expectedTestId: string | null;

  @Column({ field: "approved_ip_address", type: DataType.STRING, allowNull: true })
  declare approvedIpAddress: string | null;

  @Column({ field: "created_at", type: DataType.DATE, defaultValue: DataType.NOW })
  declare createdAt: Date;
}
