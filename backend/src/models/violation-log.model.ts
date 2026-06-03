import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "violation_logs", timestamps: false })
export class ViolationLog extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ field: "test_id", type: DataType.STRING, allowNull: false })
  declare testId: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare time: Date;

  @Column({ field: "ip_address", type: DataType.STRING, allowNull: true })
  declare ipAddress: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare type: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare message: string;

  @Column({ field: "is_ok", type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isOk: boolean;

  @BelongsTo(() => User, { targetKey: 'testId' })
  declare user: User;
}
