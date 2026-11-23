/**
 * The game only has two kinds of mana: black and colorless. Mana of any other
 * color is treated as colorless, so there is nothing more to model.
 */
export const MANA_TYPES = ["B", "C"] as const;

export type ManaType = (typeof MANA_TYPES)[number];

/** Mana a player has floating. Empties at the end of every step and phase. */
export type ManaPool = Record<ManaType, number>;

/** Costs only ever use generic and black mana, e.g. {2}{B} is `{ generic: 2, black: 1 }`. */
export interface ManaCost {
	generic: number;
	black: number;
}

export function emptyManaPool(): ManaPool {
	return { B: 0, C: 0 };
}

export function manaPoolTotal(pool: Readonly<ManaPool>): number {
	return MANA_TYPES.reduce((sum, type) => sum + pool[type], 0);
}

/** "{B}{B}{C}", or "-" for an empty pool. */
export function formatManaPool(pool: Readonly<ManaPool>): string {
	const symbols = MANA_TYPES.flatMap((type) =>
		Array.from({ length: pool[type] }, () => `{${type}}`),
	);
	return symbols.length === 0 ? "-" : symbols.join("");
}

/** "{2}{B}", with the generic part first as on a card. "{0}" for a free spell. */
export function formatManaCost(cost: Readonly<ManaCost>): string {
	const generic = cost.generic > 0 ? `{${cost.generic}}` : "";
	const black = "{B}".repeat(cost.black);
	return `${generic}${black}` || "{0}";
}

/**
 * The pool left over after paying `cost` from `pool`, or null if the pool
 * can't cover it. Black mana pays black costs. Generic costs are paid with
 * colorless first, so any black mana is kept for later. Pure: never mutates
 * the pool it is given.
 */
export function payFromPool(
	pool: Readonly<ManaPool>,
	cost: Readonly<ManaCost>,
): ManaPool | null {
	if (pool.B < cost.black) {
		return null;
	}
	const remaining: ManaPool = { B: pool.B - cost.black, C: pool.C };
	const fromColorless = Math.min(remaining.C, cost.generic);
	remaining.C -= fromColorless;
	const fromBlack = cost.generic - fromColorless;
	if (remaining.B < fromBlack) {
		return null;
	}
	remaining.B -= fromBlack;
	return remaining;
}
