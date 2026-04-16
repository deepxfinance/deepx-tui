import { Contract, type JsonRpcProvider } from 'ethers';

export const SUBACCOUNT_CONTRACT_ADDRESS =
  '0x0000000000000000000000000000000000000451';

export const SUBACCOUNT_USER_STATS_ABI = [
  'function userStats(address user) view returns ((tuple(address subaccount, bytes name)[] subaccounts, uint64 if_staked_quote_asset_amount, uint16 number_of_sub_accounts, uint16 number_of_sub_accounts_created))',
] as const;

export type SimpleSubaccount = {
  subaccount: string;
  name: string;
};

export type UserStats = {
  subaccounts: SimpleSubaccount[];
  if_staked_quote_asset_amount: bigint | number;
  number_of_sub_accounts: bigint | number;
  number_of_sub_accounts_created: bigint | number;
};

export function getSubaccountsFromUserStats(stats: UserStats) {
  return stats.subaccounts;
}

export function getPrimarySubaccountFromUserStats(input: {
  walletAddress: string;
  subaccounts: { subaccount: string }[];
}) {
  const subaccountAddress = input.subaccounts[0]?.subaccount;
  if (!subaccountAddress) {
    throw new Error(
      `No subaccount found for ${input.walletAddress}. Create or initialize a subaccount first.`,
    );
  }

  return subaccountAddress;
}

export async function fetchUserSubaccounts(input: {
  walletAddress: string;
  provider: JsonRpcProvider;
}) {
  const subaccountContract = new Contract(
    SUBACCOUNT_CONTRACT_ADDRESS,
    SUBACCOUNT_USER_STATS_ABI,
    input.provider,
  );
  const stats = (await subaccountContract.userStats(
    input.walletAddress,
  )) as UserStats;

  return getSubaccountsFromUserStats(stats);
}

export async function resolvePrimarySubaccountAddress(input: {
  walletAddress: string;
  provider: JsonRpcProvider;
}) {
  return getPrimarySubaccountFromUserStats({
    walletAddress: input.walletAddress,
    subaccounts: await fetchUserSubaccounts(input),
  });
}
