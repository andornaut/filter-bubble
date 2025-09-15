import { fromStorage, toStorage } from './storage';

// Mock chrome.storage.sync
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
};

describe('storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fromStorage', () => {
    it('should return state from chrome storage', async () => {
      const mockState = { topics: { list: [] }, websites: { list: [] } };
      chrome.storage.sync.get.mockResolvedValue({ state: mockState });

      const result = await fromStorage();
      expect(chrome.storage.sync.get).toHaveBeenCalledWith(['state']);
      expect(result).toEqual(mockState);
    });

    it('should return empty object if no state found', async () => {
      chrome.storage.sync.get.mockResolvedValue({});

      const result = await fromStorage();
      expect(result).toEqual({});
    });
  });

  describe('toStorage', () => {
    it('should save state to chrome storage', () => {
      const mockState = { topics: { list: [] }, websites: { list: [] } };

      toStorage(mockState);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ state: mockState });
    });
  });
});
