/**
 * The game only has two kinds of mana: black and colorless. Mana of any other
 * color is treated as colorless, so there is nothing more to model.
 */
export const MANA_TYPES = ["B", "C"] as const;

export type ManaType = (typeof MANA_TYPES)[number];

/** Mana a player has floating. Empties at the end of every step and phase. */
export type ManaPool = Record<ManaType, number>;

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
