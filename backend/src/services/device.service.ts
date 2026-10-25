import { Op } from 'sequelize';
import { DeviceKeyMap } from "../models/device-key-map.model";
import { CryptoService } from "./crypto.service";
import { HttpError } from "../utils/http-error";
import { SystemSettingsService } from "./system-settings.service";
import { LoginRequest } from "../models/login-request.model";
import { UnblockedDevice } from "../models/unblocked-device.model";
import { User } from "../models/user.model";
import { SocketService } from "../sockets/socket.service";
import { BindingService } from "./binding.service";

export class DeviceService {
  /**
   * Register a hardware device and its client AES Key (decrypted from RSA wrapper).
   */
  static async registerKey(deviceUuid: string, encryptedAesKey: string, ipAddress: string = "", resubmit = false): Promise<void> {
    let clientAesKeyBuffer: Buffer;
    try {
      clientAesKeyBuffer = CryptoService.decryptRSA(encryptedAesKey);
      if (clientAesKeyBuffer.length !== 32) {
        throw new Error("Decrypted AES key must be exactly 32 bytes (256-bit)");
      }
    } catch (error: any) {
      throw new HttpError(400, `Failed to decrypt AES key: ${error.message}`);
    }

    const existing = await DeviceKeyMap.findOne({ where: { deviceUuid }, include: [User] });

    // An approval is tied to the requested UUID, mode, and source address.
    const approval = await UnblockedDevice.findOne({
      where: { targetType: "UUID", targetValue: deviceUuid }
    });
    const approved = !!approval &&
      (approval.approvalMode === "SAME_USER"
        ? !!existing?.testId && existing.testId === approval.expectedTestId &&
          existing.user?.testId === approval.expectedTestId
        : approval.approvalMode === "NEW_USER" && !existing?.testId) &&
      (!approval.approvedIpAddress || approval.approvedIpAddress === ipAddress);

    const isSimulationMode = process.env.LOAD_TEST_MODE === 'simulation';
    const allowRegistration = await SystemSettingsService.getAllowDeviceRegistration();

    /* Self-service is open for exactly one phase — machines in the room,
     * students not yet in it. After that every arrival goes past a TA.
     *
     * A machine that already exists is treated no differently here. The key
     * lives in memory only, so a restart genuinely arrives as an unregistered
     * machine with a new key; refusing it on that basis alone is what used to
     * turn every crash into a dead end that no path could recover from. */
    if (!allowRegistration && !approved && !isSimulationMode) {
      const requestStatus = await this.requestEntry(deviceUuid, ipAddress, existing, resubmit);
      if (requestStatus === "REJECTED") {
        throw new HttpError(
          403,
          "This entry request was rejected by the TA. Submit a new request to try again.",
          "entry_rejected"
        );
      }
      throw new HttpError(
        403,
        "Registration is closed. A request has been sent to the TA.",
        "entry_pending"
      );
    }

    if (existing) {
      existing.clientAesKey = clientAesKeyBuffer.toString("hex");
      existing.envCheckSequence = 0;
      existing.envCheckStatus = 'UNKNOWN';
      existing.envCheckFailedLanguages = null;
      existing.envCheckReportedAt = null;
      existing.ipAddress = ipAddress;
      existing.isOnline = true;
      existing.status = existing.testId ? "AWAITING_LOGIN" : "UNBOUND";
      await existing.save();
    } else {
      await DeviceKeyMap.create({
        deviceUuid,
        ipAddress,
        clientAesKey: clientAesKeyBuffer.toString("hex"),
        isOnline: true,
        status: "UNBOUND"
      });
    }

    SocketService.triggerDataUpdateEvent('connection');
    SocketService.triggerDataUpdateEvent('student');
  }

  /**
   * Record that a machine is waiting to be let in.
   *
   * Changes nothing about the device itself. A device UUID travels in clear
   * text on every request, so anyone can send one that is not theirs — if a
   * refused request could alter a device, a student mid-exam could be shown as
   * disconnected on the TA's console by someone else's request.
   *
   * One pending request per machine. A rejected request stays rejected during
   * automatic retries; only an explicit resubmission creates a new request.
   */
  private static async requestEntry(
    deviceUuid: string,
    ipAddress: string,
    existing: DeviceKeyMap | null,
    resubmit: boolean
  ): Promise<"PENDING" | "REJECTED"> {
    const latest = await LoginRequest.findOne({
      where: { deviceUuid },
      order: [["id", "DESC"]]
    });
    if (latest?.status === "PENDING") return "PENDING";
    if (latest?.status === "REJECTED" && !resubmit) return "REJECTED";

    /* Classified by what the machine is, not by what happened to it. The
     * backend cannot tell a restart from a swapped seat — both send exactly
     * this request — but it can say whether this machine is new, was bound to
     * someone, or was registered and never claimed. Those need different
     * decisions from the TA. */
    let type: string;
    let previousTestId: string | null = null;

    if (!existing) {
      type = "NEW_DEVICE";
    } else if (existing.testId) {
      type = "REBIND";
      previousTestId = existing.testId;
    } else {
      type = "UNBOUND_DEVICE";
    }

    const userByIp = existing?.testId
      ? null
      : await User.findOne({ where: { ipAddress } });

    await LoginRequest.create({
      ipAddress,
      deviceUuid,
      testId: previousTestId ?? userByIp?.testId ?? null,
      previousTestId,
      type,
      status: "PENDING"
    });

    SocketService.triggerDataUpdateEvent('connection');
    return "PENDING";
  }

  /**
   * Record a machine's environment-check verdict.
   *
   * Stores the verdict and the failing language names, nothing more. The full
   * report stays on the machine: an invigilator needs to know whether a seat is
   * usable, and the compiler output that would explain why is unbounded — this
   * system has frozen before on exactly that kind of untruncated text.
   */
  static async recordEnvironmentReport(
    deviceUuid: string,
    status: string,
    failedLanguages: string[]
  ): Promise<void> {
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!device) {
      throw new HttpError(401, `Unauthorized: Device UUID "${deviceUuid}" is not registered`);
    }

    device.envCheckStatus = status;
    device.envCheckFailedLanguages = failedLanguages.length
      ? JSON.stringify(failedLanguages)
      : null;
    device.envCheckReportedAt = new Date();
    await device.save();

    SocketService.triggerDataUpdateEvent("student");
  }

  static async recordOrderedEnvironmentReport(
    deviceUuid: string, clientAesKey: string, sequence: number,
    status: 'RUNNING' | 'PASSED' | 'FAILED', failedLanguages: string[]
  ): Promise<void> {
    const [updated] = await DeviceKeyMap.update({
      envCheckSequence: sequence, envCheckStatus: status,
      envCheckFailedLanguages: failedLanguages.length ? JSON.stringify(failedLanguages) : null,
      envCheckReportedAt: new Date()
    }, { where: { deviceUuid, clientAesKey, envCheckSequence: { [Op.lt]: sequence } } });
    if (updated) SocketService.triggerDataUpdateEvent('student');
    else if (!(await DeviceKeyMap.findOne({ where: { deviceUuid, clientAesKey } }))) {
      throw new HttpError(401, 'Device registration has changed', 'device_not_registered');
    }
  }

  /**
   * Retrieve the client AES Key for a specific device uuid as a Buffer.
   * Throws 401 Unauthorized if not registered.
   */
  static async getAesKey(deviceUuid: string): Promise<Buffer> {
    const record = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!record) {
      throw new HttpError(401, `Unauthorized: Device UUID "${deviceUuid}" is not registered`);
    }
    return Buffer.from(record.clientAesKey, "hex");
  }

  /**
   * Delete the device key registry (used for resetting connection).
   */
  static async deleteKey(deviceUuid: string): Promise<void> {
    const record = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!record) {
      throw new HttpError(404, `Not Found: Device with UUID "${deviceUuid}" does not exist`);
    }
    await BindingService.unregisterDevice(deviceUuid);
  }
}
