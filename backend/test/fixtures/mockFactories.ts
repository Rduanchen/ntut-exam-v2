import { User } from '../../src/models/user.model';

export const createMockPayload = (overrides = {}) => {
  return {
    code: 'console.log("hello world");',
    language: 'javascript',
    timeLimit: 1000,
    memoryLimit: 512,
    ...overrides
  };
};

export const createMockSession = (overrides = {}) => {
  return {
    userId: `user_${Math.floor(Math.random() * 1000)}`,
    deviceId: `device_${Math.floor(Math.random() * 1000)}`,
    ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
    taApprovalStatus: false,
    ...overrides
  };
};

export const setupTestUser = async (testId: string = 'test_123') => {
  return await User.create({
    testId,
    name: 'Test Student'
  });
};
