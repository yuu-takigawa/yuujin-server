import { EggPlugin } from 'egg';

const plugin: EggPlugin = {
  teggConfig: {
    enable: true,
    package: '@eggjs/tegg-config',
  },
  tegg: {
    enable: true,
    package: '@eggjs/tegg-plugin',
  },
  teggController: {
    enable: true,
    package: '@eggjs/tegg-controller-plugin',
  },
  orm: {
    enable: true,
    package: 'egg-orm',
  },
};

export default plugin;
