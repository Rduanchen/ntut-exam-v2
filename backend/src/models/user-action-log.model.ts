import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "user_action_logs", timestamps: false })
export class UserActionLog extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  declare timestamp: Date;

  @ForeignKey(() => User)
  @Column({ field: "test_id", type: DataType.STRING, allowNull: false })
  declare testId: string;

  @Column({ field: "ip_address", type: DataType.STRING, allowNull: true })
  declare ipAddress: string;

  @Column({ field: "action_type", type: DataType.STRING, allowNull: false })
  declare actionType: string;

  @Column(DataType.TEXT)
  declare details: string;

  @BelongsTo(() => User, { targetKey: 'testId' })
  declare user: User;
}
