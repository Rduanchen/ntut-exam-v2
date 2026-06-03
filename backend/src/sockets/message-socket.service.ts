import { Namespace, Socket } from "socket.io";
import { DeviceKeyMap } from "../models/device-key-map.model";
import { User } from "../models/user.model";
import { ViolationLog } from "../models/violation-log.model";
import logger from "../utils/logger.util";
import { SocketService } from "./socket.service";

export class MessageSocketService {
  private io: Namespace;
  private static instance: MessageSocketService;

  private constructor(io: Namespace) {
    this.io = io;
    this.setupConnectionHandler();
  }

  public static initialize(io: Namespace): MessageSocketService {
    if (!MessageSocketService.instance) {
      MessageSocketService.instance = new MessageSocketService(io);
    }
    return MessageSocketService.instance;
  }

  public static getInstance(): MessageSocketService {
    if (!MessageSocketService.instance) {
      throw new Error(
        "MessageSocketService not initialized. Call initialize() first.",
      );
    }
    return MessageSocketService.instance;
  }

  private setupConnectionHandler(): void {
    this.io.on("connection", (socket: Socket) => {
      logger.info(`User message socket connected: ${socket.id}`);

      socket.on("register", async (data: any) => {
        try {
          const device_uuid = data?.device_uuid;
          if (!device_uuid) return;

          logger.info(`User socket ${socket.id} registering device ${device_uuid}`);

          const device = await DeviceKeyMap.findByPk(device_uuid);
          if (!device) {
            logger.warn(`Device ${device_uuid} not found for socket ${socket.id}`);
            return;
          }

          const user = await User.findOne({ where: { deviceUuid: device_uuid } });
          if (user) {
            if (device.isOnline) {
              await ViolationLog.create({
                testId: user.testId,
                type: 'network',
                message: 'User reconnected',
                isOk: false,
              });
              SocketService.triggerAlertEvent({
                testId: user.testId,
                type: 'network',
                message: 'User reconnected'
              });
            }
          }

          device.socketId = socket.id;
          device.isOnline = true;
          await device.save();
        } catch (error: any) {
          logger.error(`Socket register error: ${error.message}`);
        }
      });

      socket.on("disconnect", async () => {
        logger.info(`User message socket disconnected: ${socket.id}`);
        try {
          const device = await DeviceKeyMap.findOne({ where: { socketId: socket.id } });
          if (device) {
            device.isOnline = false;
            device.socketId = ""; // Or null, but string is safer if typings require string
            await device.save();

            const user = await User.findOne({ where: { deviceUuid: device.deviceUuid } });
            if (user) {
              await ViolationLog.create({
                testId: user.testId,
                type: 'network',
                message: 'User disconnected',
                isOk: false,
              });
              SocketService.triggerAlertEvent({
                testId: user.testId,
                type: 'network',
                message: 'User disconnected'
              });
            }
          }
        } catch (error: any) {
          logger.error(`Socket disconnect error: ${error.message}`);
        }
      });
    });
  }

  public emitEvent(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public static sendMessage(messageData: {
    id: number;
    type: string;
    message: string;
  }): void {
    const instance = MessageSocketService.getInstance();
    instance.emitEvent("exam-message", {
      success: true,
      data: messageData,
    });
  }

  public static sendConfigUpdateNotification(messageId: number): void {
    const instance = MessageSocketService.getInstance();
    instance.emitEvent("exam-message", {
      success: true,
      data: {
        id: messageId,
        type: "config_update",
        message: "Exam configuration has been updated",
      },
    });
  }
}

export default MessageSocketService;
