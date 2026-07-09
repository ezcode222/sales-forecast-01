import { lookupCustomerNames } from './customerMaster';

export type CustomerNameFields = {
  soldToName: string | null;
  shipToName: string | null;
  endUser: string | null;
  endUserName: string | null;
};

export async function resolveCustomerNamesFromMaster(codes: {
  soldToCode: string;
  shipToCode: string;
  endUserCode: string;
}): Promise<CustomerNameFields> {
  const master = await lookupCustomerNames([
    codes.soldToCode,
    codes.shipToCode,
    codes.endUserCode,
  ]);

  const soldToName = master.get(codes.soldToCode) ?? null;
  const shipToName = master.get(codes.shipToCode) ?? null;
  const endUser = master.get(codes.endUserCode) ?? null;

  return {
    soldToName,
    shipToName,
    endUser,
    endUserName: endUser,
  };
}

export async function applyCustomerMasterNames<
  T extends {
    soldToCode: string;
    shipToCode: string;
    endUserCode: string;
    soldToName?: string | null;
    shipToName?: string | null;
    endUser?: string | null;
    endUserName?: string | null;
  },
>(data: T): Promise<T> {
  const names = await resolveCustomerNamesFromMaster({
    soldToCode: data.soldToCode,
    shipToCode: data.shipToCode,
    endUserCode: data.endUserCode,
  });

  return {
    ...data,
    soldToName: names.soldToName,
    shipToName: names.shipToName,
    endUser: names.endUser,
    endUserName: names.endUserName,
  };
}
