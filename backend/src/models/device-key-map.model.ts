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

  @HasOne(() => User)
  declare user: User;
}
