import {
  getNetworkConfig,
  type NetworkConfig,
  normalizeRuntimeNetwork,
} from '../config/networks';

export type CliOptions = {
  showHelp: boolean;
  mode: 'default' | 'debug';
  network: NetworkConfig;
  passthroughArgs: string[];
};

export function parseCliArgs(argv: string[]): CliOptions {
  const showHelp = argv.includes('--help') || argv.includes('-h');
  const valueFlags = new Set(['--network', '-n', '--mode']);

  const flagValue = (flags: string[]) => {
    const flagIndex = argv.findIndex((arg) => flags.includes(arg));
    if (flagIndex < 0) {
      return '';
    }

    const value = argv[flagIndex + 1] ?? '';
    return value.startsWith('-') ? '' : value;
  };

  const networkValue = flagValue(['--network', '-n']);
  const modeValue = flagValue(['--mode']);
  const passthroughArgs = argv.filter((arg, index) => {
    if (arg === '--help' || arg === '-h') {
      return false;
    }

    if (valueFlags.has(arg)) {
      return false;
    }

    const previousArg = argv[index - 1];
    return !valueFlags.has(previousArg);
  });

  return {
    showHelp,
    mode: modeValue === 'debug' ? 'debug' : 'default',
    network: getNetworkConfig(normalizeRuntimeNetwork(networkValue)),
    passthroughArgs,
  };
}
