import { z } from "zod";

export const address    = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a checksummed or lowercase hex address");
export const txHash     = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte hex hash");
export const chainId    = z.number().int().positive().optional();
export const sortOpt    = z.enum(["asc", "desc"]).optional();
export const tag        = z.string().optional();               // "latest", "earliest", hex block
export const blockNum   = z.number().int().nonnegative();
export const blockTag   = z.union([z.number().int().nonnegative(), z.enum(["latest", "earliest", "pending"])]);

export const pagination = {
  page:   z.number().int().positive().optional(),
  offset: z.number().int().positive().max(10000).optional(),
};

export const blockRange = {
  start_block: z.number().int().nonnegative().optional(),
  end_block:   z.number().int().nonnegative().optional(),
};

export function blockRangeRefine(
  data: { start_block?: number; end_block?: number },
  ctx:  z.RefinementCtx,
): void {
  if (data.start_block !== undefined && data.end_block !== undefined && data.start_block > data.end_block) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "start_block must be ≤ end_block", path: ["start_block"] });
  }
}

// Helper: format wei → ETH string
export function weiToEth(wei: string | bigint): string {
  const n = BigInt(wei);
  const eth = Number(n) / 1e18;
  return eth.toFixed(18).replace(/\.?0+$/, "");
}
