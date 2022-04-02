// Core functionality for Plentyland
ig.module("plugins.plentyland").requires(
	"game.main",
	"impact.sound"
).defines(() => {
	window.plentyland = ig.Class.extend({});
	plentyland.root = String(
		/** @type {any} */(window).plentylandRoot ||
		"https://auburn557.github.io/Plentyland/ext/"
	);

	/**
	 * Asserts that the given value is an instance of the given type, then returns the value.
	 * @param {any} value 
	 * @param {Function|"number"|"boolean"|"function"|"string"|"object"|"undefined"} type 
	 * @returns {any}
	 */
	function checkType(value, type) {
		if (typeof value !== type && typeof type !== "string" && !(value instanceof type)) {
			throw new Error("Plentyland needs to update obfuscation bindings");
		}
		return value;
	}

	// Bindings for obfuscated code. These will need to be updated every time obfuscation changes.
	plentyland.player = checkType(ig.game.O8006, ig.Entity);
	checkType(plentyland.player.say, Function);
	plentyland.isWearing = "O7187";
	checkType(plentyland.player[plentyland.isWearing], Function);
	plentyland.soundManagerClass = checkType(ig.O1654, Function);
	plentyland.soundManager = checkType(ig.O2212, plentyland.soundManagerClass);
	plentyland.brainManagerOnSound = checkType(ig.game.brainManager.O5925, Function)
		.bind(ig.game.brainManager);
	plentyland.cancelLoop = "O884";
	checkType(ig[plentyland.cancelLoop], Function);
	plentyland.cancelId = "O869";
	checkType(ig.system[plentyland.cancelId], "number");

	// Finish

	plentyland.player.say("plentyland active");
});

// Audio fixes
ig.module("plugins.plentyland.audio").requires(
	"plugins.plentyland",
	"plugins.mland-soundextensions",
	"game.core.brainmanager"
).defines(() => {
	if (!ig.Sound.enabled || !window.AudioContext || !window.Promise) {
		return;
	}

	// Choose a compatible audio extension, mirroring Impact's method
	let extension = "";
	if (window.Audio) {
		let testAudio = new Audio();
		for (const format of ig.Sound.use) {
			if (testAudio.canPlayType(format.mime)) {
				extension = format.ext;
				break;
			}
		}
	}
	if (!extension) {
		return;
	}

	/**
	 * Describes `ig.Sound` with Plentyland's modifications.
	 * @typedef {{
	 * 		pl_group: Set<PlentylandSound> | null | undefined,
	 * 		pl_isLoading: boolean | undefined,
	 * 		pl_buffer: AudioBuffer,
	 * 		pl_playing: Set<AudioNode> | undefined,
	 * 		pl_played: boolean | undefined,
	 * 		path: string,
	 * 		volume: number,
	 * 		play: (this: PlentylandSound) => void,
	 * 		stop: (this: PlentylandSound) => void,
	 * 		load: (this: PlentylandSound) => void
	 * }} PlentylandSound 
	 */

	// Functionality to load all of an instrument's notes once the first note is played.
	// Deleting this block safely disables the feature.
	{
		/** @type {Map<string,Set<PlentylandSound>>} */
		const soundGroups = new Map();
		const sounds = ig.game.sounds;
		for (const name in sounds) {
			/** @type {PlentylandSound} */
			const sound = sounds[name];
			if (sound instanceof ig.Sound) {
				const match = name.match(/_[0-9]/);
				if (match) {
					const prefix = name.substring(0, match.index || 0);
					if (prefix in ig.game.sounds.instruments) {
						let group = soundGroups.get(prefix);
						if (!group) {
							group = new Set();
							soundGroups.set(prefix, group);
						}
						group.add(sound);
						sound.pl_group = group;
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

	ig.Sound.inject(/** @type {Partial<PlentylandSound>} */({
		load: function () {
			// Load the sounds associated with this sound's group.
			const group = this.pl_group;
			this.pl_group = null;
			if (group) {
				group.delete(this);
				group.forEach(sound => {
					sound.pl_group = null;
					sound.load();
				})
			}
			// Check if already loaded
			if (!this.pl_buffer && !this.pl_isLoading) {
				this.pl_isLoading = true;
				// Path logic as defined in Impact's code
				const path =
					ig.prefix +
					this.path.replace(/[^\.]+$/, extension) +
					ig.nocache;
				// Fetch and decode sound file
				fetch(path)
					.then(response => response.arrayBuffer())
					.then(data => audio.decodeAudioData(data))
					.then(buffer => {
						this.pl_buffer = buffer;
						if (this.pl_played) {
							this.pl_played = false;
							this.play();
						}
						this.pl_isLoading = false;
					})
					.catch(() => {
						this.pl_isLoading = false;
					});
			}
		},
		play: function () {
			if (
				ig.game.settings.doPlaySound &&
				!plentyland.player[plentyland.isWearing]("mutesAll") &&
				ig.Sound.enabled
			) {
				const buffer = this.pl_buffer;
				if (buffer) {
					// Report to brainManager
					plentyland.brainManagerOnSound(this.path);

					// Set up audio nodes
					const source = audio.createBufferSource();
					source.buffer = buffer;
					const gain = audio.createGain();
					gain.gain.value = this.volume * plentyland.soundManager.volume;
					source.connect(gain);
					gain.connect(destination);
					source.start();
					source.onended = () => {
						gain.disconnect();
						this.pl_playing?.delete(gain);
					};

					// Add audio node to the currently playing list
					if (!this.pl_playing) {
						this.pl_playing = new Set();
					}
					this.pl_playing.add(gain);

					// Some browsers pause the audio context if there's no user interaction
					audio.resume();
				} else {
					this.pl_played = true;
					this.load();
				}
			}
		},
		stop: function () {
			// Prevent any currently loading sounds from playing
			this.pl_played = false;

			// Stop all currently playing sounds
			const playing = this.pl_playing;
			if (playing) {
				playing.forEach(node => {
					node.disconnect();
				})
				playing.clear();
			}
		}
	}));
});

// A reimplementation of the graphics engine to use WebGL in a worker. The game now draws at a much
// lower framerate, but interpolates between frames. This results in a huge performance win, 
// making the game viable on much more hardware while still feeling smooth.
// The lower update rate causes some issues with code that assumes 60fps.
ig.module("plugins.plentyland.graphics").requires(
	"plugins.plentyland"
).defines(() => {

	// This how often the game is updated and drawn. WebGL interpolates between draws.
	const updatesPerSecond = 20;

	// Cancel main game loop (we will be implementing our own)
	ig[plentyland.cancelLoop](ig.system[plentyland.cancelId]);

	const scaleFactor = 2;

	let drawCount = 500;
	function logDraw(value) {
		if (drawCount-- > 0) {
			consoleref.warn(value);
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
			let x1;
			let y1;
			let x2;
			let y2;
			const transform = this.state.transform;
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
			let imageDeltaX = deltaX;
			let imageDeltaY = deltaY;
			if (interpolation !== null) {
				if (interpolation.capacity - 2 <= interpolation.index) {
					interpolation.capacity += 2;
					if (interpolation.capacity > interpolation.points.length) {
						const newPoints = new Float64Array(interpolation.capacity * 2);
						newPoints.set(interpolation.points);
						interpolation.points = newPoints;
					}
				} else {
					imageDeltaX = x1 - /** @type {number} */(
						interpolation.points[interpolation.index]
					);
					imageDeltaY = y1 - /** @type {number} */(
						interpolation.points[interpolation.index + 1]
					);
				}
				interpolation.points[interpolation.index++] = x1;
				interpolation.points[interpolation.index++] = y1;
			}
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
				x1 - imageDeltaX,
				y1 - imageDeltaY,
				x2 - imageDeltaX,
				y2 - imageDeltaY,
				imageDeltaX,
				imageDeltaY,
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
			if (candidateNode && candidateAge !== tickCount) {
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
					consoleref.log(
						"Deallocated at " +
						child.x +
						", " +
						child.y +
						" last drawn " +
						(tickCount - child.lastDrawn) +
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
				if (this.lastDrawn >= tickCount) {
					// We're in cooldown from a failed allocation.
					return false;
				}
				const context = image.getContext("2d");
				if (!context) { throw new Error("Unable to create context") }
				if (!Atlas.allocate(this, width, height)) {
					consoleref.warn(`Unable to allocate ${width}x${height} image`);
					// Set this reservation on cool down to limit thrashing of the algorithm
					this.lastDrawn = tickCount + Math.ceil(Math.random() * updatesPerSecond);
					return false;
				}
				const pixels = context.getImageData(x, y, width, height);
				consoleref.log(
					`Loaded a ${pixels.width}x${pixels.height} image at (${this.x}, ${this.y})`
				);
				Draw.uploadToAtlas(pixels, this.x, this.y);
			}
			this.lastDrawn = tickCount;
			return true;
		}
	}

	const context = new PlentyContext();
	ig.system.context = context;

	class Draw {
		static initialize() {
			return fetch(String(new URL("worker.js", plentyland.root)))
				.then(response => response.blob())
				.then(blob => {
					/** @type {ClientCommands} */
					const clientCommands = {
						returnBuffer: buffer => {
							Draw.geometryBuffer = new DataView(buffer);
						}
					}
					const workerURL = URL.createObjectURL(blob);
					Draw.worker = new Worker(workerURL);
					Draw.worker.onmessage = message => {
						const data = message.data;
						clientCommands[data.shift()](...data);
					};

					// Inject our own canvas implementation
					/** @type {HTMLCanvasElement?} */
					let oldCanvas = null;
					oldCanvas = /** @type {HTMLCanvasElement} */(ig.system.canvas);
					Draw.canvas = document.createElement("canvas");
					Draw.canvas.id = oldCanvas.id;
					Draw.canvas.style.cssText = oldCanvas.style.cssText;
					Draw.canvas.width = oldCanvas.width;
					Draw.canvas.height = oldCanvas.height;
					oldCanvas.parentNode?.insertBefore(Draw.canvas, oldCanvas);
					oldCanvas.parentNode?.removeChild(oldCanvas);
					oldCanvas = null;
					ig.system.canvas = Draw.canvas;

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
				Draw.xToScreenX = scaleFactor / Draw.canvas.width;
				Draw.yToScreenY = -scaleFactor / Draw.canvas.height;
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

	let previousScreenX = ig.game.screen.x;
	let previousScreenY = ig.game.screen.y;
	let deltaX = 0;
	let deltaY = 0;

	Draw.initialize();

	const msPerTick = 1000 / updatesPerSecond;
	const deltaTime = 1 / updatesPerSecond;
	const interpolationFactor = updatesPerSecond / 1000;
	function gameLoop() {
		ig.system.run();
		Draw.finalize(tickCount * msPerTick, interpolationFactor);
		tickCount++;
		let waitTime = msPerTick * tickCount - Date.now();
		if (waitTime < -500) {
			tickCount = Math.ceil(Date.now() / msPerTick);
			waitTime = msPerTick * tickCount - Date.now();
		}
		setTimeout(gameLoop, waitTime);
	}
	let tickCount = Math.ceil(Date.now() / msPerTick);
	setTimeout(gameLoop, msPerTick * tickCount - Date.now());
	Object.defineProperties(ig.system, {
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

	/** 
	 * @typedef {{
	 * 		lastTick: number,
	 * 		capacity: number,
	 * 		index: number,
	 * 		points: Float64Array,
	 * }} Interpolation
	 */

	/** @type {Interpolation?} */
	let interpolation = null;

	ig.BackgroundMap.inject({
		/**
		 * @this {{
		 * 		pl_previousX?: number,
		 * 		pl_previousY?: number,
		 * 		scroll: {x: number, y: number}
		 * 		parent: () => void,
		 * }}
		 */
		draw:
			function drawMap() {
				const scrollX = this.scroll.x + ig.game.O598.originX;
				const scrollY = this.scroll.y + ig.game.O598.originY;
				const previousX = this.pl_previousX ?? scrollX;
				const previousY = this.pl_previousY ?? scrollY;
				const savedDeltaX = deltaX;
				const savedDeltaY = deltaY;
				deltaX = (previousX - scrollX) * Draw.xToScreenX * ig.system.scale;
				deltaY = (previousY - scrollY) * Draw.yToScreenY * ig.system.scale;
				this.parent();
				this.pl_previousX = scrollX;
				this.pl_previousY = scrollY;
				deltaX = savedDeltaX;
				deltaY = savedDeltaY;
			}
	});

	const excludeDraw = new Set([window.MLand.prototype, window.Item.prototype]);

	for (const key in window) {
		const value = /** @type {any} */(window)[key];
		if (!(value instanceof Object)) { continue; }
		const prototype = value.prototype;
		if (!(prototype instanceof Object) || excludeDraw.has(prototype)) { continue; }
		const draw = prototype.draw;
		if (typeof draw !== "function") { continue; }
		/**
		 * @this {HasInterpolation}
		 */
		prototype.draw = function () {
			let myInterpolation = this.pl_interpolation;
			if (!myInterpolation) {
				myInterpolation = this.pl_interpolation = {
					lastTick: 0,
					capacity: 0,
					index: 0,
					points: new Float64Array(2)
				};
			}
			if (myInterpolation.lastTick < tickCount) {
				myInterpolation.index = 0;
				if (myInterpolation.lastTick < tickCount - 1) {
					myInterpolation.capacity = 0;
				}
			}
			const savedInterpolation = interpolation;
			interpolation = myInterpolation;
			draw.apply(this, arguments);
			interpolation.lastTick = tickCount;
			interpolation = savedInterpolation;
		}
	}

	// Inject into draw logic
	MLand.inject({
		draw: function () {
			Draw.updateScreenTransform();
			const screenX = ig.game.screen.x;
			const screenY = ig.game.screen.y;
			deltaX = (previousScreenX - screenX) * Draw.xToScreenX * ig.system.scale;
			deltaY = (previousScreenY - screenY) * Draw.yToScreenY * ig.system.scale;
			previousScreenX = screenX;
			previousScreenY = screenY;
			this.parent();
		}
	});
});

/** 
 * @typedef {{
 * 		returnBuffer: (buffer: ArrayBuffer) => void
 * }} ClientCommands
 */