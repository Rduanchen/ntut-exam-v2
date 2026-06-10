import { Namespace, Socket } from "socket.io";
import logger from "../utils/logger.util";

export class SocketService {
  private io: Namespace;
  private static instance: SocketService;

  private constructor(io: Namespace) {
    this.io = io;
    this.setupConnectionHandler();
  }

  public static initialize(io: Namespace): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService(io);
    }
    return SocketService.instance;
  }

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      throw new Error(
        "SocketService not initialized. Call initialize() first.",
      );
    }
    return SocketService.instance;
  }

  private setupConnectionHandler(): void {
    this.io.on("connection", (socket: Socket) => {
      logger.info(`Admin socket connected: ${socket.id}`);

      socket.on("disconnect", () => {
        logger.info(`Admin socket disconnected: ${socket.id}`);
      });
    });
  }

  public emitEvent(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Notify the frontend that a student's score has been updated.
   * @param scoreData The score data to broadcast.
   */
  static triggerScoreUpdateEvent(scoreData: any): void {
    logger.info(`[SocketService] Triggering score update event with data: ${JSON.stringify(scoreData)}`);
    try {
      const instance = SocketService.getInstance();
      instance.emitEvent("score-update", {
        success: true,
        result: scoreData,
      });
    } catch (err: any) {
      logger.error(`Error triggering score update event: ${err.message}`);
    }
  }

  /**
   * Notify the admin that a new alert (e.g., violation log) has been generated.
   * @param alertData The alert data.
   */
  static triggerAlertEvent(alertData: any): void {
    logger.info(`[SocketService] Triggering new alert event with data: ${JSON.stringify(alertData)}`);
    try {
      const instance = SocketService.getInstance();
      instance.emitEvent("new-alert", {
        success: true,
        result: alertData,
      });
    } catch (err: any) {
      logger.error(`Error triggering alert event: ${err.message}`);
    }
  }
  /**
   * Notify the frontend to re-fetch specific data.
   * @param dataType The type of data that was updated (e.g., 'log', 'connection', 'student')
   */
  static triggerDataUpdateEvent(dataType: string): void {
    logger.info(`[SocketService] Triggering data update event for type: ${dataType}`);
    try {
      const instance = SocketService.getInstance();
      instance.emitEvent("data-update", { type: dataType });
    } catch (err: any) {
      logger.error(`Error triggering data update event: ${err.message}`);
    }
  }
}
export default SocketService;
