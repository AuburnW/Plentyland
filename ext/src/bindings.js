/**
 * Provides typed bindings to Manyland code.
 */
export class Bindings {
	/** Initializes bindings, finding obfuscated keys. */
	static initialize() {
		Bindings.bindByCriteria(
			[Bindings.ig.game],
			"pl_player",
			Bindings.ig.Entity,
			["say"],
			[Object.getPrototypeOf(Bindings.ig.game)]
		);
		Bindings.bindByCriteria(
			[Bindings.ig.game],
			"pl_foregroundMap",
			Object,
			["originX", "originY"],
			[Object.getPrototypeOf(Bindings.ig.game)]
		);
		Bindings.bindByCode(
			Object.getPrototypeOf(Bindings.ig.game.pl_player),
			/\. ?WEARABLE ?\].*\. ?attributes.*\. ?attributes ?\[/g,
			"pl_getWearableAttribute"
		);
		Bindings.bindByCriteria(
			[Bindings.ig],
			"pl_soundManager",
			Bindings.ig.Class,
			["volume", "format", "clips"],
		);
		Bindings.bindByCode(
			Object.getPrototypeOf(Bindings.ig.game.brainManager),
			/staticResourcePrefix.*media\/sounds\//g,
			"pl_onPlaySound"
		);
		Bindings.bindByCode(
			Object.getPrototypeOf(Bindings.ig.system),
			/ig ?\.[a-zA-Z0-9$_]+ ?\( ?this ?\. ?[a-zA-Z0-9$_]+ ?\).*this ?\. ?running ?=/g,
			"pl_stop"
		);

	}

	/**
	 * Finds a binding by matching on the function's code.
	 * @private
	 * @template {object} T
	 * @template {keyof T} K
	 * @param {T} object 
	 * @param {RegExp} pattern 
	 * @param {K} exposeKey 
	 * @param {[object]=} defineOn 
	 */
	static bindByCode(object, pattern, exposeKey, defineOn) {
		Bindings.bindByPredicate(object, value => {
			if (!(typeof value === "function")) { return false }
			const code = String(value)
				.replaceAll(/(\/\/.*?\n)|(\/\*.*?\*\/)/gs, "") // Remove comments
				.replaceAll(/\s+/g, " ") // Normalize whitespace
				.trim();
			const match = [...code.matchAll(pattern)];
			return match.length === 1;
		}, exposeKey, defineOn);
	}

	/**
	 * Finds a binding by matching against the given predicate.
	 * @private
	 * @template {object} T
	 * @template {keyof T} K
	 * @param {T} object 
	 * @param {(value: any) => boolean} predicate 
	 * @param {K} exposeKey 
	 * @param {[object]=} defineOn 
	 */
	static bindByPredicate(object, predicate, exposeKey, defineOn) {
		const candidates = Object.entries(object)
			.filter(entry => predicate(entry[1]))
			.map(entry => entry[0]);
		if (candidates.length === 1) {
			const key = String(candidates[0]);
			Object.defineProperty(defineOn ?? object, exposeKey, {
				get: function () { return this[key]; },
				set: function (value) { /** @type {any} */(this)[key] = value; }
			});
		} else {
			throw new Error(
				"A single binding candidate was not found. Candidates: [" +
				candidates.map(candidate => "`" + candidate + "`").join(", ") +
				"]"
			);
		}
	}

	/**
	 * Searches the given objects for a (potentially obfuscated) property fitting the given
	 * parameters. If a single property is found, a binding to it is exposed with the given
	 * name. If there are multiple or no properties found, an error is thrown.
	 * 
	 * This strategy is used rather than binding to obfuscated keys directly since it will
	 * work whether the properties have been obfuscated or not. It also gives resiliance to
	 * key randomization.
	 * @private
	 * @template {object} T
	 * @template {keyof T} K
	 * @param {T[]} objects The object containing the binding.
	 * @param {K} exposeKey The property name to define which exposes the binding.
	 * @param {(
	 * 		Function |
	 * 		"string" |
	 * 		"number" |
	 * 		"bigint" |
	 * 		"boolean" |
	 * 		"symbol" |
	 * 		"undefined" |
	 * 		"object" |
	 * 		"function"
	 * )} type The type of the value the property has.
	 * @param {string[]} keys A list of keys which are present on the property's value.
	 * @param {object[]=} defineOn The objects to define the property on. If not specified,
	 * properties are defined on objects within the `objects` parameter.
	 */
	static bindByCriteria(objects, exposeKey, type, keys, defineOn) {
		let candidates = new Set(objects.map(object => Object.keys(object)).flat());
		outer: for (const candidate of [...candidates]) {
			for (const object of objects) {
				// Remove candidates that aren't in all the given objects.
				if (!(candidate in object)) {
					candidates.delete(candidate);
					continue outer;
				}

				const value = /** @type {any} */(object)[candidate];

				// Remove candidates that don't match the given type.
				if (!(
					typeof value === type ||
					typeof type === "function" &&
					value instanceof type
				)) {
					candidates.delete(candidate);
					continue outer;
				}

				// Remove candidates that don't have the given keys.
				for (const key of keys) {
					if (!(key in value)) {
						candidates.delete(candidate);
						continue outer;
					}
				}
			}
		}
		const finalCandidates = [...candidates];
		if (finalCandidates.length === 1) {
			const key = String(finalCandidates[0]);
			for (const object of (defineOn ?? objects)) {
				Object.defineProperty(object, exposeKey, {
					get: function () { return this[key]; },
					set: function (value) { /** @type {any} */(this)[key] = value; }
				});
			}
		} else {
			throw new Error(
				"A single binding candidate was not found. Candidates: [" +
				finalCandidates.map(candidate => "`" + candidate + "`").join(", ") +
				"]"
			);
		}
	}

	/**
	 * Utility property to cast the global object to `any`.
	 * @private
	 * @type {any}
	 */
	static get window() { return window; }

	/**
	 * Bindings into the global scope defined by Manyland.
	 * @type {ManylandGlobalScope}
	 */
	static get self() { return /** @type {any} */(window); }

	/**
	 * Bindings into the [Impact game engine](https://impactjs.com/) along with Manyland's
	 * modifications.
	 * @type {ImpactGameEngine}
	 */
	static get ig() { return Bindings.window.ig }

	/** @type {Console} */
	static get console() { return Bindings.window.consoleref; }
}

/**
 * @typedef {{
 * 		attributes?: Record<string, boolean>
 * }} Attachment
 */

/**
 * @typedef {Function & {
 * 		inject: (injection: Record<string, any>) => void
 * }} ImpactClass
 */

/**
 * @typedef {{
 * 		plentylandRoot?: string,
 * 		Item: ImpactClass,
 * 		MLand: ImpactClass
 * }} ManylandGlobalScope
 */

/**
 * @typedef {{
 * 		nocache: string,
 * 		prefix: string,
 * 		Class: ImpactClass,
 * 		Entity: ImpactClass,
 * 		Sound: {
 * 			use: {mime: string, ext: string}[],
 * 			enabled: boolean
 * 		} & ImpactClass,
 * 		pl_soundManager: {
 * 			volume: number,
 * 			format: {mime: string, ext: string}[]
 * 		}
 * 		sounds:
 * 			Record<string, import("./audio.js").PlentySound> &
 * 			{ instruments: Record<string, {}> },
 * 		game: {
 * 			settings: {
 * 				doPlaySound: boolean
 * 			},
 * 			pl_player: {
 * 				say: (message: string) => void,
 * 				attachments: Record<string, Attachment>
 * 				pl_getWearableAttribute: (attribute: string) => boolean
 * 			},
 * 			brainManager: {
 * 				pl_onPlaySound: (path: string) => void
 * 			},
 * 			pl_foregroundMap: {
 * 				originX: number,
 * 				originY: number,
 * 			},
 * 			screen: { x: number, y: number }
 * 		},
 * 		system: {
 * 			context: CanvasRenderingContext2D,
 * 			canvas: HTMLCanvasElement,
 * 			running: boolean,
 * 			scale: number,
 * 			pl_stop: () => void,
 * 			run: () => void
 * 		},
 * 		BackgroundMap: ImpactClass,
 * }} ImpactGameEngine
 */