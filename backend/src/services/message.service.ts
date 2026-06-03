import { Message } from "../models/message.model";
import { Op } from "sequelize";

export enum MessageType {
  NOTIFICATION = "notification",
  CONFIG_UPDATE = "config_update",
}

/**
 * Create a new message
 */
export const createMessage = async (
  type: string,
  message: string,
): Promise<Message> => {
  const newMessage = await Message.create({
    type,
    message,
  });
  return newMessage;
};

/**
 * Get the latest message version (latest message ID)
 */
export const getLatestMessageVersion = async (): Promise<number> => {
  const latestMessage = await Message.findOne({
    order: [["id", "DESC"]],
  });
  return latestMessage?.id || 0;
};

/**
 * Get the latest config update message version
 */
export const getLatestConfigVersion = async (): Promise<number> => {
  const latestConfigMessage = await Message.findOne({
    where: { type: MessageType.CONFIG_UPDATE },
    order: [["id", "DESC"]],
  });
  return latestConfigMessage?.id || 0;
};

/**
 * Get all messages after a specific ID
 */
export const getMessagesAfterId = async (
  lastId: number,
): Promise<Message[]> => {
  const messages = await Message.findAll({
    where: {
      id: {
        [Op.gt]: lastId,
      },
    },
    order: [["id", "ASC"]],
  });
  return messages;
};

/**
 * Get all messages
 */
export const getAllMessages = async (): Promise<Message[]> => {
  return await Message.findAll({
    order: [["id", "DESC"]],
  });
};
