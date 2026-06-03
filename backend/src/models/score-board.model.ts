import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "score_boards", timestamps: false })
export class ScoreBoard extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ field: "test_id", type: DataType.STRING, allowNull: false, unique: true })
  declare testId: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare score: number;

  @Column({ field: "last_submit_time", type: DataType.DATE, allowNull: true })
  declare lastSubmitTime: Date;

  @Column({ field: "subtask_amount", type: DataType.INTEGER, defaultValue: 0 })
  declare subtaskAmount: number;

  @Column({ field: "passed_subtask_amount", type: DataType.INTEGER, defaultValue: 0 })
  declare passedSubtaskAmount: number;

  @Column({ field: "puzzle_amount", type: DataType.INTEGER, defaultValue: 0 })
  declare puzzleAmount: number;

  @Column({ field: "passed_puzzle_amount", type: DataType.INTEGER, defaultValue: 0 })
  declare passedPuzzleAmount: number;

  @Column({ field: "puzzle_results", type: DataType.JSON, allowNull: false, defaultValue: {} })
  declare puzzleResults: Record<string, unknown>;

  @BelongsTo(() => User, { targetKey: 'testId' })
  declare user: User;
}
