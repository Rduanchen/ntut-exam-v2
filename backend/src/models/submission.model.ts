import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ 
  tableName: "submissions", 
  timestamps: false,
  indexes: [
    { unique: true, fields: ["test_id", "question_id"] }
  ]
})
export class Submission extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ field: "test_id", type: DataType.STRING, allowNull: false })
  declare testId: string;

  @Column({ field: "question_id", type: DataType.STRING, allowNull: false })
  declare questionId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare language: string;

  @Column({ field: "code_content", type: DataType.TEXT, allowNull: false })
  declare codeContent: string;

  @Column({ field: "submit_time", type: DataType.DATE, defaultValue: DataType.NOW })
  declare submitTime: Date;

  @Column({ type: DataType.STRING, defaultValue: "Pending" })
  declare status: string;

  @Column({ field: "auto_score", type: DataType.INTEGER, allowNull: true })
  declare autoScore: number;
  @BelongsTo(() => User, { targetKey: 'testId' })
  declare user: User;
}
