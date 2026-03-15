import { EggAppConfig, PowerPartial } from 'egg';

export default () => {
  const config = {} as PowerPartial<EggAppConfig>;

  config.logger = {
    level: 'INFO',
    consoleLevel: 'INFO',
  };

  return config;
};
