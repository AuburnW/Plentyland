import { Bindings } from "./bindings.js";
import { Draw } from "./draw.js";

export class Interpolation {
	lastTick = 0;
	count = 0;
	index = 0;
	list = new Float64Array(8);

	static initialize() {
		Bindings.ig.BackgroundMap.inject({
			/**
			 * @this {{
			 * 		pl_previousX?: number,
			 * 		pl_previousY?: number,
			 * 		scroll: {x: number, y: number}
			 * 		parent: () => void,
			 * }}
			 */
			draw: function () {
				const scrollX = this.scroll.x + Bindings.ig.game.pl_foregroundMap.originX;
				const scrollY = this.scroll.y + Bindings.ig.game.pl_foregroundMap.originY;
				const previousX = this.pl_previousX ?? scrollX;
				const previousY = this.pl_previousY ?? scrollY;
				const savedDeltaX = Interpolation.deltaX;
				const savedDeltaY = Interpolation.deltaY;
				Interpolation.deltaX =
					(previousX - scrollX) * Draw.xToScreenX * Bindings.ig.system.scale;
				Interpolation.deltaY =
					(previousY - scrollY) * Draw.yToScreenY * Bindings.ig.system.scale;
				this.parent();
				this.pl_previousX = scrollX;
				this.pl_previousY = scrollY;
				Interpolation.deltaX = savedDeltaX;
				Interpolation.deltaY = savedDeltaY;
			}
		});

		const msPerTick = 1000 / Interpolation.updatesPerSecond;
		const deltaTime = 1 / Interpolation.updatesPerSecond;
		const interpolationFactor = Interpolation.updatesPerSecond / 1000;

		// Replace game loop
		Bindings.ig.system.pl_stop();
		Bindings.ig.system.running = true;
		function gameLoop() {
			Bindings.ig.system.run();
			Draw.finalize(Interpolation.currentTick * msPerTick, interpolationFactor);
			Interpolation.currentTick++;
			let waitTime = msPerTick * Interpolation.currentTick - Date.now();
			if (waitTime < -500) {
				Interpolation.currentTick = Math.ceil(Date.now() / msPerTick);
				waitTime = msPerTick * Interpolation.currentTick - Date.now();
			}
			setTimeout(gameLoop, waitTime);
		}

		Interpolation.currentTick = Math.ceil(Date.now() / msPerTick);
		setTimeout(gameLoop, msPerTick * Interpolation.currentTick - Date.now());
		Object.defineProperties(Bindings.ig.system, {
			tick: {
				get: function () { return deltaTime; }
			},
			fps: {
				get: function () { return 60; }
			}
		});

		/**
		 * @typedef {{
		 * 		pl_interpolation?: Interpolation
		 * }} HasInterpolation
		 */

		const excludeDraw = new Set([
			Object.getPrototypeOf(Bindings.ig.game),
			Bindings.self.Item.prototype
		]);

		// Inject interpolation tracking into Manyland's draw functions.
		for (const key in window) {
			// Find manyland's entity types with draw commands.
			const value = /** @type {any} */(window)[key];
			if (!(value instanceof Object)) { continue; }
			const prototype = value.prototype;
			if (!(prototype instanceof Object) || excludeDraw.has(prototype)) { continue; }

			// Inject our own draw command that tracks interpolation.
			const draw = prototype.draw;
			if (typeof draw !== "function") { continue; }
			/**
			 * @this {{
			 * 		pl_interpolation?: Interpolation
			 * }}
			 */
			prototype.draw = function () {
				let interpolation = this.pl_interpolation;
				if (!interpolation) {
					interpolation = this.pl_interpolation = new Interpolation();
				}
				if (interpolation.lastTick < Interpolation.currentTick) {
					interpolation.index = 0;
					if (interpolation.lastTick < Interpolation.currentTick - 1) {
						interpolation.count = 0;
					}
				}
				const savedInterpolation = Interpolation.current;
				Interpolation.current = interpolation;
				draw.apply(this, arguments);
				Interpolation.current.lastTick = Interpolation.currentTick;
				Interpolation.current = savedInterpolation;
			}
		}

		// Get updates for every game draw.
		Bindings.self.MLand.inject({
			draw: function () {
				Draw.updateScreenTransform();
				const screenX = Bindings.ig.game.screen.x;
				const screenY = Bindings.ig.game.screen.y;
				Interpolation.deltaX =
					(Interpolation.previousScreenX - screenX) *
					Draw.xToScreenX * Bindings.ig.system.scale;
				Interpolation.deltaY =
					(Interpolation.previousScreenY - screenY) *
					Draw.yToScreenY * Bindings.ig.system.scale;
				Interpolation.previousScreenX = screenX;
				Interpolation.previousScreenY = screenY;
				this.parent();
			}
		});
	}

	/**
	 * @private
	 * @param {Interpolation} interpolation 
	 * @param {number} currentValue
	 */
	static getDelta(interpolation, currentValue) {
		const list = interpolation.list;
		if (interpolation.index < interpolation.count) {
			const value = /** @type {number} */(list[interpolation.index]);
			list[interpolation.index] = currentValue;
			interpolation.index++;
			return currentValue - value;
		} else {
			interpolation.count++;
			if (interpolation.count > list.length) {
				interpolation.list = new Float64Array(list.length * 2);
				interpolation.list.set(list);
			}
			interpolation.list[interpolation.index] = currentValue;
			interpolation.index++;
			return 0;
		}
	}

	/**
	 * Get the change in x from the current interpolation state.
	 * @param {number} value 
	 */
	static getDeltaX(value) {
		const current = Interpolation.current;
		if (current) {
			return Interpolation.getDelta(current, value);
		} else {
			return Interpolation.deltaX;
		}
	}

	/**
	 * Get the change in y from the current interpolation state.
	 * @param {number} value 
	 */
	static getDeltaY(value) {
		const current = Interpolation.current;
		if (current) {
			return Interpolation.getDelta(current, value);
		} else {
			return Interpolation.deltaY;
		}
	}

	/** @private */
	static previousScreenX = 0;
	/** @private */
	static previousScreenY = 0;
	/** @private */
	static deltaX = 0;
	/** @private */
	static deltaY = 0;

	static currentTick = 0;

	/**
	 * @private
	 * @type {Interpolation?}
	 */
	static current = null;

	/**
	 * How many times the game is updated and drawn per second.
	 * WebGL smoothly interpolates between updates.
	 * @private
	 * @readonly
	 */
	static updatesPerSecond = 20;
}