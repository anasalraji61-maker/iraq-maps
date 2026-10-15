import base from '@iraq-maps/tooling/jest';

export default {
  ...base,
  moduleNameMapper: {
    // AsyncStorage is a native module; mock it in the test environment
    '@react-native-async-storage/async-storage':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
