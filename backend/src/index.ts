import 'reflect-metadata';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { initDatabase, sequelize } from './config/database.config';
import logger from './utils/logger.util';

import userRouter from './routes/user';
import adminRouter from './routes/admin';

import http from 'http';
import { Server } from 'socket.io';
import SocketService from './sockets/socket.service';
import MessageSocketService from './sockets/message-socket.service';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/user', userRouter);
app.use('/admin', adminRouter);

app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({
      status: 'UP',
      database: 'UP',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error(`Health check database error: ${error.message}`);
    res.status(500).json({
      status: 'DOWN',
      database: 'DOWN',
      error: error.message || String(error),
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.send('NTUT Exam Host Backend is running.');
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";
  if (status >= 500) {
    logger.error(`Unhandled Server Error: ${err.message || err}`, { stack: err.stack });
  }
  res.status(status).json({ error: message });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
SocketService.initialize(io.of('/admin'));
MessageSocketService.initialize(io.of('/user'));

async function startServer() {
  try {
    await initDatabase();
    server.listen(port, () => {
      logger.info(`Server is running on http://localhost:${port}`);
    });
  } catch (error: any) {
    logger.error(`Failed to start the server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
