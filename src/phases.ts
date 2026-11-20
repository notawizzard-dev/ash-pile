/**
 * Turn structure. Every step except untap gives players priority.
 * "combat" is a single placeholder step until combat is implemented.
 */
export const PHASES = [
	"untap",
	"upkeep",
	"draw",
	"main1",
	"combat",
	"main2",
	"end",
] as const;

export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
	untap: "Untap",
	upkeep: "Upkeep",
	draw: "Draw",
	main1: "Main 1",
	combat: "Combat",
	main2: "Main 2",
	end: "End",
};
