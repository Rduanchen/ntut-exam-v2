import "reflect-metadata";
import { DataTypes } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import path from "path";
import fs from "fs";
import { DeviceKeyMap } from "../models/device-key-map.model";
import { User } from "../models/user.model";
import { Submission } from "../models/submission.model";
import { ScoreBoard } from "../models/score-board.model";
import { UserActionLog } from "../models/user-action-log.model";
import { ViolationLog } from "../models/violation-log.model";
import { Message } from "../models/message.model";
import { SystemSettings } from "../models/system-settings.model";
import { LoginRequest } from "../models/login-request.model";
import { UnblockedDevice } from "../models/unblocked-device.model";

const dbStorage =
  process.env.DB_STORAGE || path.join(__dirname, "../../database.sqlite");

/** Resolved once so backup and Sequelize always refer to the same database. */
export const databaseStorage = dbStorage;

// Ensure database parent directory exists
const dbDir = path.dirname(dbStorage);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: dbStorage,
  models: [
    DeviceKeyMap,
    User,
    Submission,
    ScoreBoard,
    UserActionLog,
    ViolationLog,
    Message,
    SystemSettings,
    LoginRequest,
    UnblockedDevice,
  ],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    // An in-memory SQLite database lives inside a single connection: a second
    // connection would silently open a second, empty database. Pin the pool to
    // one connection so the invariant is explicit rather than incidental.
    max: dbStorage === ":memory:" ? 1 : 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log(`Database connected successfully. Storage: ${dbStorage}`);

    // Sync tables
    await sequelize.sync();
    const query = sequelize.getQueryInterface();
    const columns = await query.describeTable('device_key_maps');
    if (!columns.env_check_sequence) {
      await query.addColumn('device_key_maps', 'env_check_sequence', {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0
      });
    }
    const approvalColumns = await query.describeTable('unblocked_devices');
    if (!approvalColumns.approval_mode) {
      await query.addColumn('unblocked_devices', 'approval_mode', { type: DataTypes.STRING, allowNull: true });
    }
    if (!approvalColumns.expected_test_id) {
      await query.addColumn('unblocked_devices', 'expected_test_id', { type: DataTypes.STRING, allowNull: true });
    }
    if (!approvalColumns.approved_ip_address) {
      await query.addColumn('unblocked_devices', 'approved_ip_address', { type: DataTypes.STRING, allowNull: true });
    }
    // Old UUID/IP passes had no user or machine scope and must not survive deployment.
    await UnblockedDevice.destroy({ where: { approvalMode: null } });
    console.log("Database tables synchronized.");

    // Insert default exam config if not exists
    const { DEFAULT_EXAM_CONFIG } = await import("../constants/default-config.constant");
    const existingConfig = await SystemSettings.findOne({ where: { name: "exam_config" } });
    if (!existingConfig) {
      await SystemSettings.create({
        name: "exam_config",
        value: JSON.stringify(DEFAULT_EXAM_CONFIG)
      });
      console.log("Inserted default exam config into database.");
    }
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    throw error;
  }
}
