const fs = require('fs');
const path = require('path');
const { loadConfig, loadConfigAsync, validateConfig, DEFAULT_COLUMN_MAPPINGS, DEFAULT_STATUS_MAPPINGS, DEFAULT_PRIORITY_MAPPINGS } = require('../../src/config/configParser');

// Mock the dotenv module
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  readFile: jest.fn(),
  existsSync: jest.fn(),
  exists: jest.fn((path, callback) => callback(null, true))
}));

// Mock path.join to return a fixed path for testing
jest.mock('path', () => ({
  join: jest.fn(() => '/mock/path/sync-config.json')
}));

// Mock Logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  LogLevel: {
    INFO: 'info',
    SUCCESS: 'success',
    WARN: 'warn',
    ERROR: 'error',
    DEBUG: 'debug'
  }
}));

// Mock env module
jest.mock('../../src/config/env', () => ({
  MONDAY_API_KEY: 'env_api_key',
  MONDAY_BOARD_ID: 'env_board_id',
  MONDAY_GROUP_IDS: '["env_group_id"]',
  DEVELOPER_ID: 'env_developer_id',
  NODE_ENV: 'test',
  LOG_LEVEL: 'info'
}));

describe('Configuration Parser', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    process.cwd = jest.fn(() => '/mock/path');
  });

  describe('loadConfig', () => {
    test('should load and validate a valid configuration', () => {
      // Setup mock return values
      const mockConfig = {
        monday_board_id: '12345',
        monday_group_ids: ['group1', 'group2'],
        monday_api_key: 'api_key_123',
        developer_id: 'dev_123'
      };
      
      // Expected output with default mappings applied
      const expectedConfig = {
        ...mockConfig,
        column_mappings: DEFAULT_COLUMN_MAPPINGS,
        status_mappings: DEFAULT_STATUS_MAPPINGS,
        priority_mappings: DEFAULT_PRIORITY_MAPPINGS
      };
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      // Call the function
      const config = loadConfig();

      // Assertions
      expect(path.join).toHaveBeenCalledWith('/mock/path', 'sync-config.json');
      expect(fs.existsSync).toHaveBeenCalledWith('/mock/path/sync-config.json');
      expect(fs.readFileSync).toHaveBeenCalledWith('/mock/path/sync-config.json', 'utf8');
      expect(config).toEqual(expectedConfig);
    });

    test('should throw an error if the configuration file is not found', () => {
      // Setup mock to simulate file not found
      fs.existsSync.mockReturnValue(false);

      // Call the function
      const config = loadConfig();
      
      // Should use environment variables as fallback
      expect(config.monday_api_key).toBe('env_api_key');
      expect(config.monday_board_id).toBe('env_board_id');
    });

    test('should throw an error if the JSON is invalid', () => {
      // Setup mock to return invalid JSON
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ invalid: json }');

      // Expect the function to throw an error
      expect(() => loadConfig()).toThrow('Invalid JSON');
    });
  });

  describe('loadConfigAsync', () => {
    test('should load and validate a valid configuration asynchronously', async () => {
      // Setup mock return values
      const mockConfig = {
        monday_board_id: '12345',
        monday_group_ids: ['group1', 'group2'],
        monday_api_key: 'api_key_123',
        developer_id: 'dev_123'
      };
      
      // Expected output with default mappings applied
      const expectedConfig = {
        ...mockConfig,
        column_mappings: DEFAULT_COLUMN_MAPPINGS,
        status_mappings: DEFAULT_STATUS_MAPPINGS,
        priority_mappings: DEFAULT_PRIORITY_MAPPINGS
      };
      
      // Setup mock for exists to return true via callback
      fs.exists.mockImplementation((path, callback) => callback(null, true));
      
      // Setup mock for readFile to return valid JSON via callback
      fs.readFile.mockImplementation((path, encoding, callback) => {
        callback(null, JSON.stringify(mockConfig));
      });

      // Call the function and await the result
      const config = await loadConfigAsync();

      // Assertions
      expect(path.join).toHaveBeenCalledWith('/mock/path', 'sync-config.json');
      expect(config).toEqual(expectedConfig);
    });

    test('should use environment variables if the configuration file is not found asynchronously', async () => {
      // Setup mock for exists to return false via callback
      fs.exists.mockImplementation((path, callback) => callback(null, false));

      // Call the function and await the result
      const config = await loadConfigAsync();
      
      // Should use environment variables as fallback
      expect(config.monday_api_key).toBe('env_api_key');
      expect(config.monday_board_id).toBe('env_board_id');
    });
  });

  describe('validateConfig', () => {
    test('should validate a complete configuration without errors', () => {
      const validConfig = {
        monday_board_id: '12345',
        monday_group_ids: ['group1', 'group2'],
        monday_api_key: 'api_key_123',
        developer_id: 'dev_123'
      };

      // This should not throw
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    test('should throw an error if monday_board_id is missing', () => {
      const invalidConfig = {
        monday_group_ids: ['group1', 'group2'],
        monday_api_key: 'api_key_123',
        developer_id: 'dev_123'
      };

      expect(() => validateConfig(invalidConfig)).toThrow('monday_board_id is required');
    });

    test('should throw an error if monday_group_ids is not an array', () => {
      const invalidConfig = {
        monday_board_id: '12345',
        monday_group_ids: 'not_an_array',
        monday_api_key: 'api_key_123',
        developer_id: 'dev_123'
      };

      expect(() => validateConfig(invalidConfig)).toThrow('monday_group_ids must be a non-empty array');
    });

    test('should throw an error if monday_group_ids is an empty array', () => {
      const invalidConfig = {
        monday_board_id: '12345',
        monday_group_ids: [],
        monday_api_key: 'api_key_123',
        developer_id: 'dev_123'
      };

      expect(() => validateConfig(invalidConfig)).toThrow('monday_group_ids must be a non-empty array');
    });

    test('should throw an error if monday_api_key is missing', () => {
      const invalidConfig = {
        monday_board_id: '12345',
        monday_group_ids: ['group1', 'group2'],
        developer_id: 'dev_123'
      };

      expect(() => validateConfig(invalidConfig)).toThrow('monday_api_key is required');
    });

    test('should throw an error if developer_id is missing', () => {
      const invalidConfig = {
        monday_board_id: '12345',
        monday_group_ids: ['group1', 'group2'],
        monday_api_key: 'api_key_123'
      };

      expect(() => validateConfig(invalidConfig)).toThrow('developer_id is required');
    });
  });
}); 