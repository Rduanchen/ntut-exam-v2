import { Table, Column, Model, DataType } from "sequelize-typescript";

@Table({ tableName: "system_settings", timestamps: false })
export class SystemSettings extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @Column({ type: DataType.STRING, unique: true, allowNull: false })
  declare name: string;

  @Column(DataType.TEXT)
  declare value: string;
}
