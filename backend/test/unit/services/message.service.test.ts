import { describe, it, expect } from 'vitest';

import {
  MessageType,
  createMessage,
  getLatestMessageVersion,
  getLatestConfigVersion,
  getMessagesAfterId,
  getAllMessages,
} from '../../../src/services/message.service';
import { Message } from '../../../src/models/message.model';

// Note: this module exports standalone functions rather than a static class.
describe('MessageService', () => {
  describe('createMessage', () => {
    it('persists a message with its type and body', async () => {
      const msg = await createMessage(MessageType.NOTIFICATION, 'Exam starts in 5 minutes');

      expect(msg.id).toBeDefined();
      const stored = await Message.findByPk(msg.id);
      expect(stored!.type).toBe(MessageType.NOTIFICATION);
      expect(stored!.message).toBe('Exam starts in 5 minutes');
    });
  });

  describe('getLatestMessageVersion', () => {
    it('returns 0 when no messages exist', async () => {
      await Message.destroy({ where: {} });

      expect(await getLatestMessageVersion()).toBe(0);
    });

    it('returns the highest message id', async () => {
      await createMessage(MessageType.NOTIFICATION, 'first');
      const second = await createMessage(MessageType.EXAM, 'IN_PROGRESS');

      expect(await getLatestMessageVersion()).toBe(second.id);
    });
  });

  describe('getLatestConfigVersion', () => {
    it('returns 0 when no config-update message exists', async () => {
      await createMessage(MessageType.NOTIFICATION, 'unrelated');

      expect(await getLatestConfigVersion()).toBe(0);
    });

    it('ignores non config-update messages when picking the latest', async () => {
      const config = await createMessage(MessageType.CONFIG_UPDATE, 'v1');
      await createMessage(MessageType.NOTIFICATION, 'later but irrelevant');

      expect(await getLatestConfigVersion()).toBe(config.id);
    });
  });

  describe('getMessagesAfterId', () => {
    it('returns only messages newer than the given id, in ascending order', async () => {
      const first = await createMessage(MessageType.NOTIFICATION, 'one');
      const second = await createMessage(MessageType.NOTIFICATION, 'two');
      const third = await createMessage(MessageType.NOTIFICATION, 'three');

      const after = await getMessagesAfterId(first.id);

      expect(after.map((m) => m.id)).toEqual([second.id, third.id]);
    });

    it('returns everything when given 0', async () => {
      await Message.destroy({ where: {} });
      await createMessage(MessageType.NOTIFICATION, 'one');

      expect(await getMessagesAfterId(0)).toHaveLength(1);
    });

    it('returns an empty list when nothing is newer', async () => {
      const latest = await createMessage(MessageType.NOTIFICATION, 'one');

      expect(await getMessagesAfterId(latest.id)).toHaveLength(0);
    });
  });

  describe('getAllMessages', () => {
    it('returns messages newest first', async () => {
      await Message.destroy({ where: {} });
      const first = await createMessage(MessageType.NOTIFICATION, 'one');
      const second = await createMessage(MessageType.NOTIFICATION, 'two');

      expect((await getAllMessages()).map((m) => m.id)).toEqual([second.id, first.id]);
    });
  });
});
