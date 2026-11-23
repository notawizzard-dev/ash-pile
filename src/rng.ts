/**
 * Small seedable PRNG (mulberry32). Its whole state is one uint32, so it can
 * live inside GameState and every shuffle is reproducible from the seed.
 */
export class Rng {
	private s: number;

	constructor(state: number) {
		this.s = state >>> 0;
	}

	get state(): number {
		return this.s;
	}

	/** Float in [0, 1). */
	next(): number {
		this.s = (this.s + 0x6d2b79f5) >>> 0;
		let t = this.s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/**
	 * In-place Fisher–Yates shuffle. Elements are objects, so `undefined` can
	 * only mean an out-of-range index, which the loop bounds rule out.
	 */
	shuffle<T extends object>(items: T[]): void {
		for (let i = items.length - 1; i > 0; i--) {
			const j = Math.floor(this.next() * (i + 1));
			const a = items[i];
			const b = items[j];
			if (a === undefined || b === undefined) {
				throw new Error("shuffle index out of range");
			}
			items[i] = b;
			items[j] = a;
		}
	}
}

export function randomSeed(): number {
	return Math.floor(Math.random() * 2 ** 32);
}
