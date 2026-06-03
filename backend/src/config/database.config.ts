import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import path from 'path';
import fs from 'fs';
import { DeviceKeyMap } from '../models/device-key-map.model';
import { User } from '../models/user.model';
import { Submission } from '../models/submission.model';
import { ScoreBoard } from '../models/score-board.model';
import { UserActionLog } from '../models/user-action-log.model';
import { ViolationLog } from '../models/violation-log.model';
import { Message } from '../models/message.model';
import { SystemSettings } from '../models/system-settings.model';

const dbStorage = process.env.DB_STORAGE || path.join(__dirname, '../../database.sqlite');

// Ensure database parent directory exists
const dbDir = path.dirname(dbStorage);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbStorage,
  models: [
    DeviceKeyMap,
    User,
    Submission,
    ScoreBoard,
    UserActionLog,
    ViolationLog,
    Message,
    SystemSettings
  ],
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

export async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log(`Database connected successfully. Storage: ${dbStorage}`);
    
    // Sync tables
    await sequelize.sync();
    console.log('Database tables synchronized.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}
