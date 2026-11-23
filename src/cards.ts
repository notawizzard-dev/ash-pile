import type { ManaType } from "./mana";

export type CardType = "land" | "creature" | "instant" | "sorcery";

export interface CardDefinition {
	name: string;
	types: readonly CardType[];
	/** The mana this card's "{T}: Add one mana" ability produces, if it has one. */
	tapForMana?: ManaType;
}

/**
 * Wastes is a development placeholder that taps for colorless; it is not
 * planned for the final game.
 */
export const BASIC_LAND_NAMES = ["Swamp", "Wastes"] as const;

const BASIC_LAND_MANA: Record<(typeof BASIC_LAND_NAMES)[number], ManaType> = {
	Swamp: "B",
	Wastes: "C",
};

const DEFINITIONS = new Map<string, CardDefinition>(
	BASIC_LAND_NAMES.map(
		(name) =>
			[name, { name, types: ["land"], tapForMana: BASIC_LAND_MANA[name] }] as [
				string,
				CardDefinition,
			],
	),
);

export function getCardDefinition(name: string): CardDefinition {
	const definition = DEFINITIONS.get(name);
	if (!definition) {
		throw new Error(`Unknown card: ${name}`);
	}
	return definition;
}

export function isLand(card: { readonly name: string }): boolean {
	return getCardDefinition(card.name).types.includes("land");
}
