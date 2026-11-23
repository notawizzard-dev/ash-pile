import type { ManaCost, ManaType } from "./mana";

export type CardType = "land" | "creature" | "instant" | "sorcery";

export interface CardDefinition {
	name: string;
	types: readonly CardType[];
	/** The mana this card's "{T}: Add one mana" ability produces, if it has one. */
	tapForMana?: ManaType;
	/** What it costs to cast. Absent for lands, which are played rather than cast. */
	manaCost?: ManaCost;
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

const CARD_DEFINITIONS: readonly CardDefinition[] = [
	...BASIC_LAND_NAMES.map(
		(name): CardDefinition => ({
			name,
			types: ["land"],
			tapForMana: BASIC_LAND_MANA[name],
		}),
	),
	// Test cards: not in the shared deck. Tests and experiments put them in hands.
	{
		name: "Test Card (Do Nothing)",
		types: ["instant"],
		manaCost: { generic: 1, black: 0 },
	},
];

const DEFINITIONS = new Map<string, CardDefinition>(
	CARD_DEFINITIONS.map((definition) => [definition.name, definition]),
);

export function getCardDefinition(name: string): CardDefinition {
	const definition = DEFINITIONS.get(name);
	if (!definition) {
		throw new Error(`Unknown card: ${name}`);
	}
	return definition;
}

export function hasCardType(
	card: { readonly name: string },
	type: CardType,
): boolean {
	return getCardDefinition(card.name).types.includes(type);
}

export function isLand(card: { readonly name: string }): boolean {
	return hasCardType(card, "land");
}
