import { Table, Column, Model, DataType } from "sequelize-typescript";

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

  @Column({ field: "created_at", type: DataType.DATE, defaultValue: DataType.NOW })
  declare createdAt: Date;
}
