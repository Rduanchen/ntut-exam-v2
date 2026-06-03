import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "messages", timestamps: true, updatedAt: false })
export class Message extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @Column(DataType.STRING)
  declare type: string;

  @Column(DataType.TEXT)
  declare message: string;

  @ForeignKey(() => User)
  @Column({ field: "receiver_id", type: DataType.STRING, allowNull: true })
  declare receiverId: string;

  @BelongsTo(() => User, { targetKey: 'testId' })
  declare receiver: User;
}
