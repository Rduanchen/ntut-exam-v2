import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { DeviceKeyMap } from "./device-key-map.model";

@Table({ tableName: "users", timestamps: false })
export class User extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare uuid: string;

  @Column({ field: "test_id", type: DataType.STRING, allowNull: false, unique: true })
  declare testId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ field: "login_time", type: DataType.DATE, allowNull: true })
  declare loginTime: Date;

  @Column({ field: "ip_address", type: DataType.STRING, allowNull: true })
  declare ipAddress: string;

  @ForeignKey(() => DeviceKeyMap)
  @Column({ field: "device_uuid", type: DataType.STRING, allowNull: true })
  declare deviceUuid: string | null;

  @Column({ 
    field: "is_finished", 
    type: DataType.BOOLEAN, 
    allowNull: false, 
    defaultValue: false 
  })
  declare isFinished: boolean;

  @BelongsTo(() => DeviceKeyMap)
  declare device: DeviceKeyMap;
}
