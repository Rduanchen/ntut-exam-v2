import { Table, Column, Model, DataType } from "sequelize-typescript";

@Table({ tableName: "login_requests", timestamps: false })
export class LoginRequest extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @Column({ field: "device_uuid", type: DataType.STRING, allowNull: false })
  declare deviceUuid: string;

  @Column({ field: "ip_address", type: DataType.STRING, allowNull: true })
  declare ipAddress: string;

  @Column({ field: "test_id", type: DataType.STRING, allowNull: true })
  declare testId: string;

  /**
   * What kind of machine is asking to come in.
   *
   * Named after the state of the device, not the sequence of events: a TA has
   * to judge the machine in front of them, and the backend cannot tell a
   * restart from a swapped seat anyway — both send the same request. The old
   * pair collapsed two of these into one value, so a machine already bound to
   * a student looked identical to one that had never been claimed.
   */
  @Column({
    type: DataType.ENUM("NEW_DEVICE", "REBIND", "UNBOUND_DEVICE"),
    allowNull: false
  })
  declare type: string;

  /** For REBIND: the student this machine was bound to before. */
  @Column({ field: "previous_test_id", type: DataType.STRING, allowNull: true })
  declare previousTestId: string | null;

  @Column({ type: DataType.ENUM("PENDING", "ALLOWED", "REJECTED"), defaultValue: "PENDING" })
  declare status: string;

  @Column({ field: "created_at", type: DataType.DATE, defaultValue: DataType.NOW })
  declare createdAt: Date;
}
