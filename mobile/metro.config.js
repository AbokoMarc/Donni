const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const config = {
  transformer: {
    allowOptionalDependencies: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
