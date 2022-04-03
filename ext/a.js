/** @type {any} */(window).ig.module("plugins.plentyland").requires(
	"impact.sound",
	"plugins.mland-soundextensions",
	"game.core.brainmanager"
).defines(() => {
	/**
	 * Provides typed bindings to Manyland code.
	 */
	class Bindings {
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
		 * Bindings into the global scope.
		 * @type {{
		 * 		plentylandRoot?: string,
		 * 		Item: ImpactClass,
		 * 		MLand: ImpactClass
		 * }}
		 */
		static get self() { return /** @type {any} */(window); }

		/**
		 * Bindings into the [Impact game engine](https://impactjs.com/).
		 * @type {{
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
		 * 		sounds: Record<string, PlentySound> & { instruments: Record<string, {}> },
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
		 * }}
		 */
		static get ig() { return Bindings.window.ig }

		/** @type {Console} */
		static get console() { return Bindings.window.consoleref; }
	}
	Bindings.initialize();

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
	 * Describes `ig.Sound` with Plentyland's modifications.
	 * @typedef {{
	 * 		pl_info?: SoundInfo
	 * 		path: string,
	 * 		volume: number,
	 * 		play: (this: PlentySound) => void,
	 * 		stop: (this: PlentySound) => void,
	 * 		load: (this: PlentySound) => void
	 * }} PlentySound 
	 */

	/**
	 * Data attached to Manyland sounds used by the new audio implementation
	 */
	class SoundInfo {
		/** @type {Set<PlentySound>?} */
		group = null;
		isLoading = false;
		/** @type {AudioBuffer?} */
		buffer = null;
		/** @type {Set<AudioNode>} */
		playing = new Set();
		played = false;

		/**
		 * @param {PlentySound} sound
		 */
		static get(sound) {
			let info = sound.pl_info;
			if (!info) {
				info = sound.pl_info = new SoundInfo();
			}
			return info;
		}

		/**
		 * The gain applied to all sounds. Meant to help quiet down Manyland's default volume so
		 * that the compressor doesn't kick in as often.
		 */
		static globalGain = 0.4;
	}

	function initializeAudio() {
		if (!Bindings.ig.Sound.enabled || !window.AudioContext || !window.Promise) {
			return;
		}

		// Choose a compatible audio extension, mirroring Impact's method
		let extension = "";
		if (window.Audio) {
			let testAudio = new Audio();
			for (const format of Bindings.ig.Sound.use) {
				if (testAudio.canPlayType(format.mime)) {
					extension = format.ext;
					break;
				}
			}
		}
		if (!extension) {
			return;
		}

		// Functionality to load all of an instrument's notes once the first note is played.
		// Deleting this block safely disables the feature.
		{
			/** @type {Map<string,Set<PlentySound>>} */
			const soundGroups = new Map();
			const sounds = Bindings.ig.sounds;
			for (const name in sounds) {
				const sound = /** @type {PlentySound} */(sounds[name]);
				if (sound instanceof Bindings.ig.Sound) {
					const match = name.match(/_[0-9]/);
					if (match) {
						const prefix = name.substring(0, match.index || 0);
						if (prefix in Bindings.ig.sounds.instruments) {
							let group = soundGroups.get(prefix);
							if (!group) {
								group = new Set();
								soundGroups.set(prefix, group);
							}
							group.add(sound);
							SoundInfo.get(sound).group = group;
						}
					}
				}
			}
		}

		const audio = new AudioContext();

		/** The destination all sounds will connect to. */
		const destination = (() => {
			// This node prevents audio from clipping
			if (!window.DynamicsCompressorNode) {
				return audio.destination;
			}
			const compressor = audio.createDynamicsCompressor();
			// Configure compressor to act effectively as a limiter.
			compressor.knee.value = 0;
			compressor.ratio.value = 20;
			compressor.attack.value = 0.003;
			compressor.release.value = 1;
			compressor.threshold.value = -6;
			compressor.connect(audio.destination);
			return compressor;
		})();


		// Reimplementation of ig.Sound, including functionality from `mland-soundextensions`

		Bindings.ig.Sound.inject(/** @type {Partial<PlentySound>} */({
			load: function () {
				const info = SoundInfo.get(this);
				// Load the sounds associated with this sound's group.
				const group = info.group;
				info.group = null;
				if (group) {
					group.delete(this);
					group.forEach(sound => {
						info.group = null;
						sound.load();
					})
				}
				// Check if already loaded
				if (!info.buffer && !info.isLoading) {
					info.isLoading = true;
					// Path logic as defined in Impact's code
					const path =
						Bindings.ig.prefix +
						this.path.replace(/[^\.]+$/, extension) +
						Bindings.ig.nocache;
					// Fetch and decode sound file
					fetch(path)
						.then(response => response.arrayBuffer())
						.then(data => audio.decodeAudioData(data))
						.then(buffer => {
							info.buffer = buffer;
							if (info.played) {
								info.played = false;
								this.play();
							}
							info.isLoading = false;
						})
						.catch(() => {
							info.isLoading = false;
						});
				}
			},
			play: function () {
				if (
					Bindings.ig.game.settings.doPlaySound &&
					!Bindings.ig.game.pl_player.pl_getWearableAttribute("mutesAll") &&
					Bindings.ig.Sound.enabled
				) {
					const info = SoundInfo.get(this);
					const buffer = info.buffer;
					if (buffer) {
						// Report to brainManager
						Bindings.ig.game.brainManager.pl_onPlaySound(this.path);

						// Set up audio nodes
						const source = audio.createBufferSource();
						source.buffer = buffer;
						const gain = audio.createGain();
						gain.gain.value =
							this.volume *
							Bindings.ig.pl_soundManager.volume *
							SoundInfo.globalGain;
						source.connect(gain);
						gain.connect(destination);
						source.start();
						source.onended = () => {
							gain.disconnect();
							info.playing?.delete(gain);
						};

						// Add audio node to the currently playing list
						if (!info.playing) {
							info.playing = new Set();
						}
						info.playing.add(gain);

						// Some browsers pause the audio context if there's no user interaction
						audio.resume();
					} else {
						info.played = true;
						this.load();
					}
				}
			},
			stop: function () {
				const info = SoundInfo.get(this);
				// Prevent any currently loading sounds from playing
				info.played = false;

				// Stop all currently playing sounds
				const playing = info.playing;
				if (playing) {
					playing.forEach(node => {
						node.disconnect();
					})
					playing.clear();
				}
			}
		}));
	}

	let drawCount = 500;
	/**
	 * 
	 * @param {any} value 
	 */
	function logDraw(value) {
		if (drawCount-- > 0) {
			Bindings.console.warn(value);
		}
	}

	class PlentyContextState {
		computedColor = Color.createRGBA().fill(255);
		color = Color.createRGBA().fill(255);
		globalAlpha = 1;
		transform = Transform.createMatrix();
		/** `true` if the current transform matrix is the identity matrix. */
		isIdentity = true;
	}

	/**
	 * Utility functions for manipulating colors.
	 */
	class Color {
		static createRGBA() {
			return /** @type {Color.RGBA} */(new Uint8Array(4));
		}
	}

	/**
	 * @typedef {Uint8Array & [red: number, green: number, blue: number, alpha: number]} Color.RGBA
	 */

	/**
	 * Utility functions for manipulating transform matrices.
	 */
	class Transform {
		/**
		 * Returns the x component of the given point multiplied by the transform matrix.
		 * @param {number} x
		 * @param {number} y
		 * @param {Transform.Matrix} matrix 
		 */
		static getX(x, y, matrix) {
			return matrix[0] * x + matrix[2] * y + matrix[4];
		}

		/**
		 * eturns the y component of the given point multiplied by the transform matrix.
		 * @param {number} x
		 * @param {number} y
		 * @param {Transform.Matrix} matrix 
		 */
		static getY(x, y, matrix) {
			return matrix[1] * x + matrix[3] * y + matrix[5];
		}

		/**
		 * Multiplies `a` by `b`, storing the result in `a`.
		 * @param {Transform.Matrix} a 
		 * @param {Transform.Matrix} b
		 */
		static multiply(a, b) {
			const r0 = a[0] * b[0] + a[2] * b[1];
			const r1 = a[1] * b[0] + a[3] * b[1];
			const r2 = a[0] * b[2] + a[2] * b[3];
			const r3 = a[1] * b[2] + a[3] * b[3];
			const r4 = a[0] * b[4] + a[2] * b[5] + a[4];
			const r5 = a[1] * b[4] + a[3] * b[5] + a[5];
			a[0] = r0;
			a[1] = r1;
			a[2] = r2;
			a[3] = r3;
			a[4] = r4;
			a[5] = r5;
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {Transform.Matrix} matrix
		 */
		static translate(x, y, matrix) {
			matrix[4] = matrix[0] * x + matrix[2] * y + matrix[4];
			matrix[5] = matrix[1] * x + matrix[3] * y + matrix[5];
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {Transform.Matrix} matrix 
		 */
		static scale(x, y, matrix) {
			matrix[0] = matrix[0] * x;
			matrix[1] = matrix[1] * x;
			matrix[2] = matrix[2] * y;
			matrix[3] = matrix[3] * y;
		}

		static createMatrix() {
			return /** @type {Transform.Matrix} */(new Float64Array([1, 0, 0, 1, 0, 0]));
		}

		/**
		 * 
		 * @param {Float64Array & [x: number, y: number]} point 
		 * @param {Transform.Matrix} matrix 
		 * @param {Float64Array & [x: number, y: number]} result 
		 */
		static point(point, matrix, result) {
			result[0] = matrix[0] * point[0] + matrix[2] * point[1];
			result[1] = matrix[1] * point[0] + matrix[3] * point[1];
		}
	}

	/** 
	 * @typedef {Float64Array & [
	 * 		c1r1: number,
	 * 		c1r2: number,
	 * 		c2r1: number,
	 * 		c2r2: number,
	 * 		c3r1: number,
	 * 		c3r2: number
	 * ]} Transform.Matrix
	 */

	/**
	 * An implementation of `CanvasRenderingContext2D` that forwards calls to WebGL in a worker
	 */
	class PlentyContext {
		/** @type {PlentyContextState[] & [PlentyContextState]} */
		stateStack = [new PlentyContextState()];
		stateIndex = 0;
		state = this.stateStack[0];

		/** A place to put inputs to matrix calculations without generating garbage */
		inputMatrix = Transform.createMatrix();
		/** A place to put outputs to matrix calculations without generating garbage */
		outputMatrix = Transform.createMatrix();

		/**
		 * 
		 * @param {HTMLCanvasElement} image 
		 * @param {number} sx 
		 * @param {number} sy 
		 * @param {number} sw 
		 * @param {number} sh 
		 * @param {number} dx 
		 * @param {number} dy 
		 * @param {number} dw 
		 * @param {number} dh 
		 */
		drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
			const sourceX = Math.max(Math.floor(sx), 0);
			const sourceY = Math.max(Math.floor(sy), 0);
			const sourceWidth = Math.min(Math.ceil(sw), image.width);
			const sourceHeight = Math.min(Math.ceil(sh), image.height);
			const dx2 = dx + dw;
			const dy2 = dy + dh;
			const transform = this.state.transform;
			let x1;
			let y1;
			let x2;
			let y2;
			if (this.state.isIdentity) {
				x1 = dx;
				y1 = dy;
				x2 = dx2;
				y2 = dy2;
			} else {
				x1 = Transform.getX(dx, dy, transform);
				y1 = Transform.getY(dx, dy, transform);
				x2 = Transform.getX(dx2, dy2, transform);
				y2 = Transform.getY(dx2, dy2, transform);
			}
			x1 = (Draw.xOffset + x1) * Draw.xToScreenX;
			y1 = (Draw.yOffset + y1) * Draw.yToScreenY;
			x2 = (Draw.xOffset + x2) * Draw.xToScreenX;
			y2 = (Draw.yOffset + y2) * Draw.yToScreenY;

			const deltaX = Interpolation.getDeltaX(x1);
			const deltaY = Interpolation.getDeltaY(y1);

			const reservation =
				Atlas.getReservation(image, sourceX, sourceY, sourceWidth, sourceHeight);

			if (!reservation.reserve(image, sourceX, sourceY, sourceWidth, sourceHeight)) {
				// Reservation failed, so skip drawing.
				return;
			}

			const u1 = reservation.x + sx - sourceX;
			const v1 = reservation.y + sy - sourceY;
			const u2 = u1 + sw;
			const v2 = v1 + sh;
			Draw.rectangle(
				x1 - deltaX,
				y1 - deltaY,
				x2 - deltaX,
				y2 - deltaY,
				deltaX,
				deltaY,
				u1,
				v2,
				u2,
				v1,
				this.state.computedColor
			);
		}
		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} w 
		 * @param {number} h 
		 */
		fillRect(x, y, w, h) {
			logDraw({ fillRect: [x, y, w, h] });
		}

		save() {
			this.stateIndex++;
			let state = this.stateStack[this.stateIndex];
			if (state === undefined) {
				state = new PlentyContextState();
				this.stateStack[this.stateIndex] = state;
			}
			state.color.set(this.state.color);
			state.computedColor.set(this.state.computedColor);
			state.globalAlpha = this.state.globalAlpha;
			state.transform.set(this.state.transform);
			state.isIdentity = this.state.isIdentity;
			this.state = state;
		}

		restore() {
			this.stateIndex--;
			const state = this.stateStack[this.stateIndex];
			if (state === undefined) {
				this.stateIndex = 0;
			} else {
				this.state = state;
			}
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 */
		scale(x, y) {
			Transform.scale(x, y, this.state.transform);
			this.state.isIdentity = false;
		}

		beginPath() {
			logDraw("Began path");
		}

		closePath() {
			logDraw("Closed path");
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} width 
		 * @param {number} height 
		 */
		rect(x, y, width, height) {
			logDraw({ rect: [x, y, width, height] });
		}

		/**
		 * 
		 * @param {"nonzero" | "evenodd" | Path2D=} ruleOrPath 
		 * @param {"nonzero" | "evenodd"=} rule 
		 */
		fill(ruleOrPath, rule) {
			logDraw({ fill: [ruleOrPath, rule] });
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 */
		translate(x, y) {
			Transform.translate(x, y, this.state.transform);
			this.state.isIdentity = false;
		}

		/**
		 * 
		 * @param {number} radians
		 */
		rotate(radians) {
			logDraw({ rotate: [radians] });
		}

		/**
		 * 
		 * @param {number} x0 
		 * @param {number} y0 
		 * @param {number} r0 
		 * @param {number} x1 
		 * @param {number} y1 
		 * @param {number} r1 
		 * @returns 
		 */
		createRadialGradient(x0, y0, r0, x1, y1, r1) {
			logDraw({ createRadialGradient: [x0, y0, r0, x1, y1, r1] });
			return new PlentyGradient();
		}

		/**
		 * 
		 * @param {number} x0 
		 * @param {number} y0 
		 * @param {number} x1 
		 * @param {number} y1 
		 */
		createLinearGradient(x0, y0, x1, y1) {
			logDraw({ createLinearGradient: [x0, y0, x1, y1] });
			return new PlentyGradient();
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 */
		moveTo(x, y) {
			logDraw({ moveTo: [x, y] });
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} radius 
		 * @param {number} startRadians 
		 * @param {number} endRadians 
		 * @param {boolean=} counterClockwise 
		 */
		arc(x, y, radius, startRadians, endRadians, counterClockwise) {
			logDraw({ arc: [x, y, radius, startRadians, endRadians, counterClockwise] });
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 */
		lineTo(x, y) {
			logDraw({ lineTo: [x, y] });
		}

		/**
		 * 
		 * @param {"string"|object} fillRuleOrPath 
		 * @param {"string"} fillRule 
		 */
		clip(fillRuleOrPath, fillRule) {
			logDraw({ clip: [fillRuleOrPath, fillRule] });
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} width 
		 * @param {number} height 
		 */
		strokeRect(x, y, width, height) {
			logDraw({ strokeRect: [x, y, width, height] });
		}

		/**
		 * 
		 * @param {Path2D=} path 
		 */
		stroke(path) {
			logDraw({ stroke: path });
		}

		get globalAlpha() { return this.state.globalAlpha }
		set globalAlpha(value) {
			if (value >= 0 && value <= 1) {
				this.state.globalAlpha = value;
				this.state.computedColor.set(this.state.color);
				this.state.computedColor[3] =
					/** @type {any} */(this.state.computedColor[3]) * value;
			}
		}
	}
	class PlentyGradient {
		/**
		 * 
		 * @param {number} offset 
		 * @param {string} color 
		 */
		addColorStop(offset, color) {

		}
	}

	/**
	 * The atlas is used to reserve space in the main texture.
	 */
	class Atlas {
		/**
		 * A child of an `AtlasNode` which represents a quadrant in the node.
		 * - `AtlasNode` indicates the quadrant is subdivided into sub-quadrants as specified by
		 * the node's children.
		 * - `AtlasReservation` represents a reservation that currently occupies the quadrant.
		 * - `null` indicates the quadrant is empty and available to be reserved.
		 * @typedef {AtlasNode | AtlasReservation | null} AtlasChild
		 */

		/**
		 * A reserved space in the atlas. Its 4 elements represent the 4 quadrants of its space.
		 * @typedef {[AtlasChild, AtlasChild, AtlasChild, AtlasChild]} AtlasNode
		 */

		/**
		 * Returns the specific reservation for the given subsection of the `image`.
		 * @param {HTMLCanvasElement & {pl_reservation?: Map<number, AtlasReservation>}} image 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} width 
		 * @param {number} height 
		 */
		static getReservation(image, x, y, width, height) {
			let map = image.pl_reservation;
			if (map === undefined) {
				map = image.pl_reservation = new Map();
			}
			const hashRange = 1 << 12;
			const allocationHash = (
				(x * hashRange + y) * hashRange + width
			) * hashRange + height;
			let reservation = map.get(allocationHash);
			if (reservation === undefined) {
				reservation = new AtlasReservation;
				map.set(allocationHash, reservation);
			}
			return reservation;
		}

		/**
		 * Reserves a space in the atlas that can accomodate the given width and height.
		 * If there is no available space, the least recently drawn reservations are deallocated to
		 * make space for the given reservation.
		 * @param {AtlasReservation} reservation 
		 * @param {number} width
		 * @param {number} height
		 * @returns {boolean} `true` if the allocation succeded. If `false`, allocation did not
		 * succeed and thus the space pointed to by the allocation should not be used.
		 */
		static allocate(reservation, width, height) {
			const targetLevel = Math.ceil(Math.log2(Math.max(width, height))) | 0;
			if (1 << targetLevel < width || 1 << targetLevel < height) {
				throw new Error("Wrong target level " + targetLevel + "for " + width + "x" + height);
			}

			// These variables keep track of the current candidate node to insert the allocation
			// into. The best candidate is an empty location. If no location is available, the best
			// candidate is the node that was least recently drawn.

			/** @type {AtlasNode?} */
			let candidateNode = null;
			let candidateIndex = 0;
			let candidateLevel = 0;
			let candidateX = 0;
			let candidateY = 0;
			let candidateAge = Number.MAX_SAFE_INTEGER;

			/**
			 * Recursively traverses the node, attemping to find a candidate space to allocate into.
			 * @param {AtlasNode} node 
			 * @param {number} level 
			 * @param {number} x 
			 * @param {number} y 
			 * @returns {number} The most recent tick the node's children have been drawn.
			 */
			function traverseNode(node, level, x, y) {
				let drawTime = 0;
				for (let index = 0; index < node.length; index++) {
					const subNode = node[index];
					/** @type {number} */
					let subDrawTime;

					// Use bit arithmetic to convert the child index into the assocaited
					// quadrant coordinates.
					const newX = x + ((index & 1) << level);
					const newY = y + ((index >> 1) << level);

					if (subNode) {
						if (subNode instanceof Array) {
							// Node is a sub-node, so traverse it.
							subDrawTime = traverseNode(subNode, level - 1, newX, newY);
						} else {
							// Node is a reservation, so record its last draw time.
							subDrawTime = subNode.lastDrawn;
						}
					} else {
						// Node is empty
						subDrawTime = 0;
						if (level > targetLevel) {
							// The node is too big, so split it into smaller nodes.

							/** @type {AtlasNode} */
							const newNode = [null, null, null, null];
							node[index] = newNode;

							// Traverse the subdivided node to either find the first empty space,
							// or subdivide it even more.
							subDrawTime = traverseNode(newNode, level - 1, newX, newY);
							if (subDrawTime !== 0) {
								throw new Error("Newly created node has lastDrawn other than 0.");
							}
							return subDrawTime;
						}
					}
					if (level >= targetLevel && subDrawTime < candidateAge) {
						// This child is a compatible size and has been drawn later than the current
						// candidate, so replace the current candidate with this node.
						candidateX = newX;
						candidateY = newY;
						candidateAge = subDrawTime;
						candidateLevel = level;
						candidateNode = node;
						candidateIndex = index;
						if (subDrawTime === 0) {
							// This child is empty, so we aren't going to find a better candidate.
							// Return early to save computation.
							return subDrawTime;
						}
					}
					drawTime = Math.max(drawTime, subDrawTime);
				}
				return drawTime;
			}
			// Find a candidate that can fit the given size
			traverseNode(Atlas.root, Atlas.sizeMagnitude - 1, 0, 0);

			if (candidateNode && candidateLevel !== targetLevel) {
				// The found candidate is larger than the given size

				// First, we deallocate the candidate
				Atlas.deallocate(candidateNode[candidateIndex]);
				/** @type {AtlasNode} */(candidateNode)[candidateIndex] = null;

				// Then replace the candidate with an empty node
				candidateNode = null;

				// Finally, split the candidate into nodes that best fit the given size.
				candidateAge = Number.MAX_SAFE_INTEGER;
				traverseNode(Atlas.root, Atlas.sizeMagnitude - 1, 0, 0);
				if (candidateNode === null) {
					throw new Error("No candidate found despite splitting a larger one.");
				}
			}
			if (candidateNode && candidateAge !== Interpolation.currentTick) {
				// A candidate was found, so set the given reservation to allocated and deallocate
				// the candidate.
				reservation.x = candidateX;
				reservation.y = candidateY;
				reservation.allocated = true;
				Atlas.deallocate(candidateNode[candidateIndex]);
				/** @type {AtlasNode} */(candidateNode)[candidateIndex] = reservation;
				Atlas.count++;
				return true;
			} else {
				return false;
			}
		}

		/**
		 * Marks the child and all of its descendants as deallocated. After deallocation, the space
		 * it occupied may be used by other `AtlasChild`s.
		 * @param {AtlasChild | undefined} child 
		 */
		static deallocate(child) {
			if (child) {
				if (child instanceof Array) {
					for (const childChild of child) {
						Atlas.deallocate(childChild);
					}
				} else {
					child.allocated = false;
					child.x = -1;
					child.y = -1;
					Atlas.count--;
					Bindings.console.log(
						"Deallocated at " +
						child.x +
						", " +
						child.y +
						" last drawn " +
						(Interpolation.currentTick - child.lastDrawn) +
						" atlas count " +
						Atlas.count
					);
				}
			}
		}

		/**
		 * @private
		 * The number of `Allocation`s currently allocated in the atlas.
		 */
		static count = 0;

		/**
		 * The root node of the atlas, which divides the whole texture into 4 equally sized quadrants.
		 * @private
		 * @readonly
		 * @type {AtlasNode}
		 */
		static root = [null, null, null, null];

		/**
		 * The exponent of the size of the texture. In other words, the x in size = 2^x
		 * @readonly
		 */
		static sizeMagnitude = 11;
	}

	/**
	 * Represents an allocation in the atlas.
	 */
	class AtlasReservation {
		allocated = false;
		lastDrawn = 0;
		x = -1;
		y = -1;

		/**
		 * Ensures that this reservation is in the atlas, allocating and uploading the image to the
		 * main texture if necessary.
		 * @param {HTMLCanvasElement} image 
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} width 
		 * @param {number} height 
		 * @returns {boolean} `true` if the reservation succeeded and the image may be drawn.
		 */
		reserve(image, x, y, width, height) {
			if (!this.allocated) {
				if (this.lastDrawn >= Interpolation.currentTick) {
					// We're in cooldown from a failed allocation.
					return false;
				}
				const context = image.getContext("2d");
				if (!context) { throw new Error("Unable to create context") }
				if (!Atlas.allocate(this, width, height)) {
					Bindings.console.warn(`Unable to allocate ${width}x${height} image`);
					// Set this reservation on cool down to limit thrashing of the algorithm
					this.lastDrawn = Interpolation.currentTick;
					return false;
				}
				const pixels = context.getImageData(x, y, width, height);
				Bindings.console.log(
					`Loaded a ${pixels.width}x${pixels.height} image at (${this.x}, ${this.y})`
				);
				Draw.uploadToAtlas(pixels, this.x, this.y);
			}
			this.lastDrawn = Interpolation.currentTick;
			return true;
		}
	}

	const context = new PlentyContext();
	Bindings.ig.system.context = /** @type {any} */(context);

	class Draw {
		static initialize() {
			const root = String(
				Bindings.self.plentylandRoot ??
				"https://auburn557.github.io/Plentyland/ext/"
			);
			return fetch(String(new URL("worker.js", root)))
				.then(response => response.blob())
				.then(blob => {
					/** @type {ClientCommands} */
					const clientCommands = {
						returnBuffer: buffer => {
							Draw.geometryBuffer = new DataView(buffer);
						},
					}
					const workerURL = URL.createObjectURL(blob);
					Draw.worker = new Worker(workerURL);
					Draw.worker.onmessage = message => {
						const data = message.data;
						/** @type {Record<any, any>} */(clientCommands)[data.shift()](...data);
					};

					// Inject our own canvas implementation
					/** @type {HTMLCanvasElement?} */
					let oldCanvas = null;
					oldCanvas = Bindings.ig.system.canvas;
					Draw.canvas = document.createElement("canvas");
					Draw.canvas.id = oldCanvas.id;
					Draw.canvas.style.cssText = oldCanvas.style.cssText;
					Draw.canvas.width = oldCanvas.width;
					Draw.canvas.height = oldCanvas.height;
					oldCanvas.parentNode?.insertBefore(Draw.canvas, oldCanvas);
					oldCanvas.parentNode?.removeChild(oldCanvas);
					oldCanvas = null;
					Bindings.ig.system.canvas = Draw.canvas;

					/** @type {HTMLCanvasElement} */
					const offscreenCanvas = /** @type {any} */(Draw.canvas)
						.transferControlToOffscreen();
					Draw.send(
						"initialize",
						[/** @type {any} */(offscreenCanvas)],
						offscreenCanvas,
						Atlas.sizeMagnitude
					);
				});
		}

		/**
		 * @param {number} x1
		 * @param {number} y1
		 * @param {number} x2
		 * @param {number} y2
		 * @param {number} deltaX 
		 * @param {number} deltaY 
		 * @param {number} u1 
		 * @param {number} v1 
		 * @param {number} u2 
		 * @param {number} v2 
		 * @param {Color.RGBA} color
		 */
		static rectangle(x1, y1, x2, y2, deltaX, deltaY, u1, v1, u2, v2, color) {
			if (Draw.geometryBuffer.buffer.byteLength === 0) { return; }

			// Triangle 1
			Draw.vertex(x1, y1, deltaX, deltaY, u1, v2, color);
			Draw.vertex(x1, y2, deltaX, deltaY, u1, v1, color);
			Draw.vertex(x2, y1, deltaX, deltaY, u2, v2, color);

			// Triangle 2
			Draw.vertex(x1, y2, deltaX, deltaY, u1, v1, color);
			Draw.vertex(x2, y2, deltaX, deltaY, u2, v1, color);
			Draw.vertex(x2, y1, deltaX, deltaY, u2, v2, color);

			Draw.vertexCount += 6;
		}

		/**
		 * Writes a vertex to the vertex buffer.
		 * @private
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} deltaX 
		 * @param {number} deltaY 
		 * @param {number} u 
		 * @param {number} v 
		 * @param {Color.RGBA} color
		 */
		static vertex(x, y, deltaX, deltaY, u, v, color) {
			let index = Draw.geometryIndex;
			const endian = Draw.isLittleEndian;
			const buffer = Draw.geometryBuffer;
			buffer.setFloat32(index, x, endian); index += 4;
			buffer.setFloat32(index, y, endian); index += 4;
			buffer.setFloat32(index, deltaX, endian); index += 4;
			buffer.setFloat32(index, deltaY, endian); index += 4;
			buffer.setInt16(index, u, endian); index += 2;
			buffer.setInt16(index, v, endian); index += 2;
			buffer.setUint8(index++, color[0]);
			buffer.setUint8(index++, color[1]);
			buffer.setUint8(index++, color[2]);
			buffer.setUint8(index++, color[3]);
			Draw.geometryIndex = index;
		}

		/**
		 * Finalizes geometry and sends it and interpolation data to WebGL.
		 * @param {number} startTime The interpolation start time for this batch of geometry.
		 * @param {number} millisecondsToInterpolation A factor that converts milliseconds after the
		 * start time into an interpolation value from 0 to 1, where 0 represents the start and 1
		 * represents the destination. Values outside of this range are valid and represent
		 * extrapolation from the start or destination.
		 */
		static finalize(startTime, millisecondsToInterpolation) {
			const buffer = Draw.geometryBuffer.buffer;
			if (buffer.byteLength > 0) {
				Draw.send(
					"loadGeometry",
					[buffer],
					buffer,
					Math.min(Draw.geometryIndex, Draw.geometryBuffer.byteLength),
					Draw.vertexCount,
					startTime,
					millisecondsToInterpolation
				);
			}
			Draw.geometryIndex = 0;
			Draw.vertexCount = 0;
		}

		/**
		 * @private
		 * @template {keyof WorkerCommands} T
		 * @param {T} command 
		 * @param {Transferable[] | null} transfer 
		 * @param {Parameters<WorkerCommands[T]>} args 
		 */
		static send(command, transfer, ...args) {
			if (Draw.worker) {
				if (transfer) {
					Draw.worker.postMessage([command, ...args], transfer);
				} else {
					Draw.worker.postMessage([command, ...args]);
				}
			} else {
				throw new Error("Worker not yet initialized");
			}
		}

		/**
		 * Uploads pixel data to the texture at the given coordinates. The backing buffer is 
		 * transferred to the worker, so the `pixels` will no longer be usable after calling
		 * this function.
		 * @param {ImageData} pixels 
		 * @param {number} x 
		 * @param {number} y 
		 */
		static uploadToAtlas(pixels, x, y) {
			Draw.send(
				"uploadToAtlas",
				[pixels.data.buffer],
				pixels.data.buffer,
				pixels.width,
				pixels.height,
				x,
				y
			);
		}

		static updateScreenTransform() {
			if (Draw.canvas) {
				Draw.xToScreenX = 2 / Draw.canvas.width;
				Draw.yToScreenY = -2 / Draw.canvas.height;
				Draw.xOffset = Draw.canvas.width * -0.5;
				Draw.yOffset = Draw.canvas.height * -0.5;
			}
		}

		/** @private @readonly */
		static maxVertices = 2048 * 4;

		/** @private @readonly */
		static vertexBufferSize =
			24 * // Bytes per vertex
			3 * // Vertices per triangle
			2 * // Triangles per quad
			Draw.maxVertices;

		/** @private */
		static geometryBuffer = new DataView(new ArrayBuffer(Draw.vertexBufferSize));

		/** @private */
		static geometryIndex = 0;

		/** @private */
		static vertexCount = 0;

		/** @private @readonly */
		static isLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

		/** @type {Worker?} */
		static worker = null;

		/** @type {HTMLCanvasElement?} */
		static canvas = null;

		static xToScreenX = 0;
		static yToScreenY = 0;
		static xOffset = 0;
		static yOffset = 0;
	}

	class Interpolation {
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

	Bindings.ig.game.pl_player.say("plentyland active");
	initializeAudio();
	Draw.initialize().then(() => {
		Interpolation.initialize();
	});
});

/** 
 * @typedef {{
 * 		returnBuffer: (buffer: ArrayBuffer) => void
 * }} ClientCommands
 */