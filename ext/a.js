/** 
 * @typedef {{
 * 		returnBuffer: (buffer: ArrayBuffer) => void
 * }} ClientCommands
 */

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
).defines(() => fetch(String(new URL("worker.js", plentyland.root))).then(r => r.blob()).then(v => {

	// This how often the game is updated and drawn. WebGL interpolates between draws.
	const updatesPerSecond = 20;

	// Cancel main game loop (we will be implementing our own)
	ig[plentyland.cancelLoop](ig.system[plentyland.cancelId]);

	const workerURL = URL.createObjectURL(v);
	const worker = new Worker(workerURL);


	// Inject our own canvas implementation
	/** @type {HTMLCanvasElement?} */
	let oldCanvas = null;
	oldCanvas = /** @type {HTMLCanvasElement} */(ig.system.canvas);
	const canvas = document.createElement("canvas");
	canvas.id = oldCanvas.id;
	canvas.style.cssText = oldCanvas.style.cssText;
	canvas.width = oldCanvas.width;
	canvas.height = oldCanvas.height;
	oldCanvas.parentNode?.insertBefore(canvas, oldCanvas);
	oldCanvas.parentNode?.removeChild(oldCanvas);
	oldCanvas = null;
	ig.system.canvas = canvas;

	/** @type {HTMLCanvasElement} */
	const offscreenCanvas = /** @type {any} */(canvas).transferControlToOffscreen();
	const textureSizeMagnitude = 11;
	const scaleFactor = 2;

	sendWorkerCommand(
		"initialize",
		[/** @type {any} */(offscreenCanvas)],
		offscreenCanvas,
		textureSizeMagnitude
	);

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
	 * @typedef {{
	 * 		pl_allocation?: Map<number,AtlasAllocation>,
	 * } & HTMLCanvasElement} PlentyCanvas
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
		 * @param {PlentyCanvas} image 
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
			let allocationMap = image.pl_allocation;
			const sourceX = Math.max(Math.floor(sx), 0);
			const sourceY = Math.max(Math.floor(sy), 0);
			const sourceWidth = Math.min(Math.ceil(sw), image.width);
			const sourceHeight = Math.min(Math.ceil(sh), image.height);

			if (allocationMap === undefined) {
				allocationMap = image.pl_allocation = new Map();
			}
			const hashRange = 1 << 12;
			const allocationHash = (
				(sourceX * hashRange + sourceY) * hashRange + sourceWidth
			) * hashRange + sourceHeight;
			let allocation = allocationMap.get(allocationHash);
			if (allocation === undefined) {
				allocation = {
					allocated: false,
					lastDrawn: 0,
					x: 0,
					y: 0
				};
				allocationMap.set(allocationHash, allocation);
			}
			const dx2 = dx + dw;
			const dy2 = dy + dh;
			const u1 = allocation.x + sx - sourceX;
			const v1 = allocation.y + sy - sourceY;
			const u2 = u1 + sw;
			const v2 = v1 + sh;
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
			x1 = (xOffset + x1) * xScaleCanvas;
			y1 = (yOffset + y1) * yScaleCanvas;
			x2 = (xOffset + x2) * xScaleCanvas;
			y2 = (yOffset + y2) * yScaleCanvas;
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
			if (!allocation.allocated) {
				if (allocation.lastDrawn >= tickCount) {
					return;
				}
				const context = image.getContext("2d");
				if (!context) { throw new Error("Unable to create context") }
				const pixels = context.getImageData(sourceX, sourceY, sourceWidth, sourceHeight);
				if (!allocateAtlas(allocation, pixels.width, pixels.height)) {
					consoleref.log("Unable to allocate image");
					// "Sleep" this allocation to prevent thrashing the allocation function with retries.
					allocation.lastDrawn = tickCount + Math.ceil(Math.random() * updatesPerSecond);
					return;
				}
				consoleref.log(`Loaded a ${pixels.width}x${pixels.height} image at (${allocation.x}, ${allocation.y})`);
				sendWorkerCommand(
					"uploadToAtlas",
					[pixels.data.buffer],
					pixels.data.buffer,
					pixels.width,
					pixels.height,
					allocation.x,
					allocation.y
				);
			}
			allocation.lastDrawn = tickCount;
			drawRectangle(
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
			// const input = this.inputMatrix;
			// const output = this.outputMatrix;
			// input[0] = x;
			// input[1] = 0;
			// input[2] = 0;
			// input[3] = y;
			// input[4] = 0;
			// input[5] = 0;
			// Transform.multiply(this.state.transform, input, output);
			// this.outputMatrix = this.state.transform;
			// this.state.transform = output;
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

	const context = new PlentyContext();
	ig.system.context = context;

	/** @type {ClientCommands} */
	const clientCommands = {
		returnBuffer: buffer => {
			geometryBuffer = new DataView(buffer);
		}
	}
	worker.onmessage = message => {
		const data = message.data;
		clientCommands[data.shift()](...data);
	};

	/**
	 * @template {keyof WorkerCommands} T
	 * @param {T} command 
	 * @param {Transferable[] | null} transfer 
	 * @param  {Parameters<WorkerCommands[T]>} args 
	 */
	function sendWorkerCommand(command, transfer, ...args) {
		if (transfer) {
			worker.postMessage([command, ...args], transfer);
		} else {
			worker.postMessage([command, ...args]);
		}
	}

	/**
	 * @typedef {{
	 * 		node: AtlasNode,
	 * 		index: number,
	 * 		level: number,
	 * 		age: number,
	 * 		x: number,
	 * 		y: number,
	 * }} AtlasStackEntry
	 */

	// Atlas Allocation

	/**
	 * 
	 * @param {AtlasChild|undefined} child 
	 */
	function deallocateAtlas(child) {
		if (child) {
			if (child instanceof Array) {
				for (const childChild of child) {
					deallocateAtlas(childChild);
				}
			} else {
				child.allocated = false;
				atlasCount--;
				consoleref.log("Deallocated at " + child.x + ", " + child.y + " last drawn " + (tickCount - child.lastDrawn) + " atlas count " + atlasCount);
			}
		}
	}

	let atlasCount = 0;

	/**
	 * Reserves a position in the texture atlas that can accomodate the given width and height.
	 * If there is no available space, the least recently drawn allocations are deallocated to
	 * make space for the given allocation.
	 * @param {AtlasAllocation} allocation 
	 * @param {number} width
	 * @param {number} height
	 * @returns {boolean}
	 */
	function allocateAtlas(allocation, width, height) {
		const targetLevel = Math.ceil(Math.log2(Math.max(width, height))) | 0;
		if (1 << targetLevel < width || 1 << targetLevel < height) {
			throw new Error("Wrong target level " + targetLevel + "for " + width + "x" + height);
		}
		/** @type {AtlasNode?} */
		let candidateNode = null;
		let candidateIndex = 0;
		let candidateLevel = 0;
		let candidateX = 0;
		let candidateY = 0;
		let candidateAge = Number.MAX_SAFE_INTEGER;
		/**
		 * 
		 * @param {AtlasNode} node 
		 * @param {number} level 
		 * @param {number} x 
		 * @param {number} y 
		 * @returns {number}
		 */
		function traverseNode(node, level, x, y) {
			let age = 0;
			for (let index = 0; index < node.length; index++) {
				const subNode = node[index];
				/** @type {number} */
				let subAge;
				const newX = x + ((index & 1) << level);
				const newY = y + ((index >> 1) << level);
				if (subNode) {
					if (subNode instanceof Array) {
						subAge = traverseNode(subNode, level - 1, newX, newY);
					} else {
						subAge = subNode.lastDrawn;
					}
				} else {
					subAge = 0;
					if (level > targetLevel) {
						/** @type {AtlasNode} */
						const newNode = [null, null, null, null];
						node[index] = newNode;
						subAge = traverseNode(newNode, level - 1, newX, newY);
						if (subAge !== 0) {
							throw new Error("Unreachable");
						}
						return subAge;
					}
				}
				if (level >= targetLevel && subAge < candidateAge) {
					candidateX = newX;
					candidateY = newY;
					candidateAge = subAge;
					candidateLevel = level;
					candidateNode = node;
					candidateIndex = index;
					if (subAge === 0) {
						return subAge;
					}
				}
				age = Math.max(age, subAge);
			}
			return age;
		}
		traverseNode(baseNode, textureSizeMagnitude - 1, 0, 0);
		if (candidateNode && candidateLevel !== targetLevel) {
			deallocateAtlas(candidateNode[candidateIndex]);
			/** @type {AtlasNode} */(candidateNode)[candidateIndex] = null;
			candidateNode = null;
			candidateAge = Number.MAX_SAFE_INTEGER;
			traverseNode(baseNode, textureSizeMagnitude - 1, 0, 0);
			if (candidateNode === null) {
				throw new Error("Unreachable");
			}
		}
		if (candidateNode && candidateAge !== tickCount) {
			allocation.x = candidateX;
			allocation.y = candidateY;
			allocation.allocated = true;
			deallocateAtlas(candidateNode[candidateIndex]);
			/** @type {AtlasNode} */(candidateNode)[candidateIndex] = allocation;
			atlasCount++;
			return true;
		} else {
			return false;
		}
	}

	/**
	 * @typedef {{
	 *      allocated: boolean,
	 * 		lastDrawn: number,
	 *      x: number,
	 *      y: number,
	 * }} AtlasAllocation
	 */

	/**
	 * @typedef {AtlasNode | AtlasAllocation | null} AtlasChild
	 */

	/**
	 * @typedef {[AtlasChild, AtlasChild, AtlasChild, AtlasChild]} AtlasNode
	 */

	/** @type {AtlasNode} */
	const baseNode = [null, null, null, null];

	// Draw

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
	 * @param {Uint8Array} color
	 */
	function drawRectangle(x1, y1, x2, y2, deltaX, deltaY, u1, v1, u2, v2, color) {
		if (geometryBuffer.buffer.byteLength === 0) { return; }

		// Triangle 1
		drawVertex(x1, y1, deltaX, deltaY, u1, v2, color);
		drawVertex(x1, y2, deltaX, deltaY, u1, v1, color);
		drawVertex(x2, y1, deltaX, deltaY, u2, v2, color);

		// Triangle 2
		drawVertex(x1, y2, deltaX, deltaY, u1, v1, color);
		drawVertex(x2, y2, deltaX, deltaY, u2, v1, color);
		drawVertex(x2, y1, deltaX, deltaY, u2, v2, color);

		vertexCount += 6;
	}

	/**
	 * 
	 * @param {number} startTime 
	 * @param {number} factor 
	 */
	function sendInterpolation(startTime, factor) {
		const buffer = geometryBuffer.buffer;
		if (buffer.byteLength > 0) {
			sendWorkerCommand(
				"loadGeometry",
				[buffer],
				buffer,
				Math.min(geometryIndex, geometryBuffer.byteLength),
				vertexCount,
				startTime,
				factor
			);
		}
		geometryIndex = 0;
		vertexCount = 0;
	}

	// Geometry parameters

	const maxQuads = 2048;
	const vertexSize = 24;
	const triangleSize = 3 * vertexSize;
	const quadSize = 2 * triangleSize;
	const bufferSize = maxQuads * quadSize;
	let geometryBuffer = new DataView(new ArrayBuffer(bufferSize));
	let geometryIndex = 0;

	let vertexCount = 0;

	let xScaleCanvas = 0;
	let yScaleCanvas = 0;
	let xOffset = 0;
	let yOffset = 0;
	let previousScreenX = ig.game.screen.x;
	let previousScreenY = ig.game.screen.y;
	let deltaX = 0;
	let deltaY = 0;

	const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} deltaX 
	 * @param {number} deltaY 
	 * @param {number} u 
	 * @param {number} v 
	 * @param {Uint8Array} color
	 */
	function drawVertex(x, y, deltaX, deltaY, u, v, color) {
		geometryBuffer.setFloat32(geometryIndex, x, littleEndian);
		geometryIndex += 4;

		geometryBuffer.setFloat32(geometryIndex, y, littleEndian);
		geometryIndex += 4;

		geometryBuffer.setFloat32(geometryIndex, deltaX, littleEndian);
		geometryIndex += 4;

		geometryBuffer.setFloat32(geometryIndex, deltaY, littleEndian);
		geometryIndex += 4;

		geometryBuffer.setInt16(geometryIndex, u, littleEndian);
		geometryIndex += 2;

		geometryBuffer.setInt16(geometryIndex, v, littleEndian);
		geometryIndex += 2;

		geometryBuffer.setUint8(geometryIndex++, /** @type {any} */(color[0]));
		geometryBuffer.setUint8(geometryIndex++, /** @type {any} */(color[1]));
		geometryBuffer.setUint8(geometryIndex++, /** @type {any} */(color[2]));
		geometryBuffer.setUint8(geometryIndex++, /** @type {any} */(color[3]));
	}

	const msPerTick = 1000 / updatesPerSecond;
	const deltaTime = 1 / updatesPerSecond;
	const interpolationFactor = updatesPerSecond / 1000;
	function gameLoop() {
		ig.system.run();
		sendInterpolation(tickCount * msPerTick, interpolationFactor);
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
				deltaX = (previousX - scrollX) * xScaleCanvas * ig.system.scale;
				deltaY = (previousY - scrollY) * yScaleCanvas * ig.system.scale;
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
			xScaleCanvas = scaleFactor / canvas.width;
			yScaleCanvas = -scaleFactor / canvas.height;
			xOffset = canvas.width * -0.5;
			yOffset = canvas.height * -0.5;
			const screenX = ig.game.screen.x;
			const screenY = ig.game.screen.y;
			deltaX = (previousScreenX - screenX) * xScaleCanvas * ig.system.scale;
			deltaY = (previousScreenY - screenY) * yScaleCanvas * ig.system.scale;
			previousScreenX = screenX;
			previousScreenY = screenY;
			this.parent();
		}
	});
}));