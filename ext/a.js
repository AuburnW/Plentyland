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
	 * @param {Function} type 
	 * @returns {any}
	 */
	function checkType(value, type) {
		if (!(value instanceof type)) {
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
// making the game viable on much more hardware.
ig.module("plugins.plentyland.graphics").requires(
	"plugins.plentyland"
).defines(() => fetch(String(new URL("worker.js", plentyland.root))).then(r => r.blob()).then(v => {
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
	const textureSizeMagnitude = 12;
	const screenSpaceFactor = 4;
	const scaleFactor = 2 * 32768 / screenSpaceFactor;

	sendWorkerCommand(
		"initialize",
		[/** @type {any} */(offscreenCanvas)],
		offscreenCanvas,
		textureSizeMagnitude,
		screenSpaceFactor
	);

	ig.Game.inject({
		/**
		 * @this {any}
		 */
		run: function () {
			xFactor = scaleFactor / canvas.width;
			yFactor = -scaleFactor / canvas.height;
			xOffset = canvas.width * -0.5;
			yOffset = canvas.height * -0.5;
			this.parent();
			sendInterpolation(Date.now(), 0);
		},
	});
	let drawCount = 500;
	function logDraw(value) {
		if (drawCount-- > 0) {
			consoleref.warn(value);
		}
	}

	/**
	 * @typedef {{
	 * 		pl_allocation?: AtlasAllocation,
	 * } & HTMLCanvasElement} PlentyCanvas
	 */

	/**
	 * An implementation of `CanvasRenderingContext2D` that forwards calls to WebGL in a worker
	 */
	class PlentyContext {
		/**
		 * 
		 * @param {CanvasImageSource} image 
		 * @param {number} dxOrSx 
		 * @param {number} dyOrSy 
		 * @param {number | undefined} dwOrSw 
		 * @param {number} dhOrSh 
		 * @param {number | undefined} dx 
		 * @param {number} dy 
		 * @param {number} dw 
		 * @param {number} dh 
		 */
		drawImage(image, dxOrSx, dyOrSy, dwOrSw, dhOrSh, dx, dy, dw, dh) {
			if (image instanceof HTMLCanvasElement && dwOrSw !== undefined && dx !== undefined) {
				/** @type {PlentyCanvas} */
				const canvas = image;
				let allocation = canvas.pl_allocation;
				if (allocation === undefined) {
					allocation = {
						allocated: false,
						x: 0,
						y: 0
					};
					canvas.pl_allocation = allocation;
				}
				if (!allocation.allocated) {
					const context = canvas.getContext("2d");
					if (!context) { throw new Error("Unable to create context") }
					const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
					allocateAtlas(allocation, pixels.width, pixels.height);
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
				if (dxOrSx < 0 || dw < 0) {
					debugger;
				}
				const x1 = (xOffset + dx) * xFactor;
				const y1 = (yOffset + dy) * yFactor;
				const x2 = x1 + (dw * xFactor);
				const y2 = y1 + (dh * yFactor);
				const u1 = allocation.x + dxOrSx;
				const v1 = allocation.y + dyOrSy;
				const u2 = u1 + dwOrSw;
				const v2 = v1 + dhOrSh;
				drawRectangle(x1, y1, x2, y2, 0, 0, u1, v2, u2, v1);
			} else {
				throw new Error();
				logDraw("context.drawImage");
			}
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
			logDraw("Saved canvas");
		}

		restore() {
			logDraw("Restored canvas");
		}

		/**
		 * 
		 * @param {number} x 
		 * @param {number} y 
		 */
		scale(x, y) {
			logDraw({ scale: [x, y] });
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
	}

	const context = new PlentyContext();
	ig.system.context = context;

	/** @type {ClientCommands} */
	const clientCommands = {
		returnBuffer: buffer => {
			geometryBuffer = new Int16Array(buffer);
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

	// Atlas Allocation

	/**
	 * 
	 * @param {AtlasAllocation} allocation 
	 * @param {number} width
	 * @param {number} height
	 */
	function allocateAtlas(allocation, width, height) {
		const level = Math.ceil(Math.log2(Math.max(width, height))) | 0;
		findAllocation(baseNode, textureSizeMagnitude - 1, level, 0, 0, allocation);
		allocation.allocated = true;
	}

	/**
	 * @typedef {{
	 *      allocated: boolean,
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

	/**
	 * @param {AtlasNode} node 
	 * @param {number} level
	 * @param {number} targetLevel 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {AtlasAllocation} allocation 
	 * @return {boolean}
	 */
	function findAllocation(node, level, targetLevel, x, y, allocation) {
		for (let i = 0; i < node.length; i++) {
			const subNode = node[i];
			const newX = x + ((i & 1) << level);
			const newY = y + ((i >> 1) << level);
			if (subNode) {
				if (subNode instanceof Array && level > targetLevel) {
					const result = findAllocation(
						subNode,
						level - 1,
						targetLevel,
						newX,
						newY,
						allocation
					);
					if (result) {
						return true;
					}
				}
			} else {
				if (level <= targetLevel) {
					allocation.x = newX;
					allocation.y = newY;
					node[i] = allocation;
					return true;
				} else {
					/** @type {AtlasNode} */
					const newNode = [null, null, null, null];
					node[i] = newNode;
					const result = findAllocation(
						newNode,
						level - 1,
						targetLevel,
						newX,
						newY,
						allocation
					);
					if (result) {
						return true;
					}
				}
			}
		}
		return false;
	}

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
	 */
	function drawRectangle(x1, y1, x2, y2, deltaX, deltaY, u1, v1, u2, v2) {
		// Triangle 1
		drawVertex(x1, y1, deltaX, deltaY, u1, v2);
		drawVertex(x1, y2, deltaX, deltaY, u1, v1);
		drawVertex(x2, y1, deltaX, deltaY, u2, v2);

		// Triangle 2
		drawVertex(x1, y2, deltaX, deltaY, u1, v1);
		drawVertex(x2, y2, deltaX, deltaY, u2, v1);
		drawVertex(x2, y1, deltaX, deltaY, u2, v2);

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
				Math.min(geometryIndex, geometryBuffer.length),
				vertexCount,
				startTime,
				factor
			);
		}
		geometryIndex = 0;
		vertexCount = 0;
	}

	function canDraw() {
		return geometryBuffer.byteLength !== 0;
	}

	// Geometry parameters

	const maxQuads = 2048;
	const vertexSize = 6;
	const triangleSize = 3 * vertexSize;
	const quadSize = 2 * triangleSize;
	const bufferSize = maxQuads * quadSize;
	let geometryBuffer = new Int16Array(bufferSize);
	let geometryIndex = 0;

	let vertexCount = 0;

	let xFactor = 0;
	let yFactor = 0;
	let xOffset = 0;
	let yOffset = 0;

	/**
	 * 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {number} deltaX 
	 * @param {number} deltaY 
	 * @param {number} u 
	 * @param {number} v 
	 */
	function drawVertex(x, y, deltaX, deltaY, u, v) {
		geometryBuffer[geometryIndex++] = x;
		geometryBuffer[geometryIndex++] = y;
		geometryBuffer[geometryIndex++] = deltaX;
		geometryBuffer[geometryIndex++] = deltaY;
		geometryBuffer[geometryIndex++] = u;
		geometryBuffer[geometryIndex++] = v;
	}

	// Reimplement Manyland draw methods.

	// ml.Image.prototype.draw =
	// 	function (a, b, c, d, e, f) {
	// 		logDraw("Drew ml.Image via draw");
	// 		return;
	// 		if (this.loaded) {
	// 			var g = ig.system.scale;
	// 			e = (e ? e : this.width) * g;
	// 			f = (f ? f : this.height) * g;
	// 			ig.system.context.drawImage(this.data, c ? c * g : 0, d ? d * g : 0, e, f, ig.system.O5949(a), ig.system.O5949(b), e, f)
	// 		}
	// 	};
	// ml.Image.prototype.O4775 = function (a, b, c, d, e, f, g) {
	// 	logDraw("Drew ml.Image via O4775");
	// 	return;
	// 	e = e ? e : d;
	// 	if (this.loaded && !(d > this.width || e > this.height)) {
	// 		var h = ig.system.scale,
	// 			k = Math.floor(d * h),
	// 			l = Math.floor(e * h),
	// 			m = f ? -1 : 1,
	// 			n = g ? -1 : 1;
	// 		if (f || g) ig.system.context.save(), ig.system.context.scale(m, n);
	// 		ig.system.context.drawImage(this.data, Math.floor(c *
	// 			d) % this.width * h, Math.floor(c * d / this.width) * e * h, k, l, ig.system.O5949(a) * m - (f ? k : 0), ig.system.O5949(b) * n - (g ? l : 0), k, l);
	// 		(f || g) && ig.system.context.restore()
	// 	}
	// };
	// ml.Image.prototype.O3081 = function (a, b, c, d, e, f, g, h) {
	// 	logDraw("Drew ml.Image via O3081");
	// 	return;
	// 	if (this.loaded) {
	// 		var k = ig.system.scale;
	// 		ig.system.context.drawImage(this.data, e ? e * k : 0, f ? f * k : 0, g * k, h * k, ig.system.O5949(a), ig.system.O5949(b), c * k, d * k)
	// 	}
	// };

	// window.Item.prototype.draw = function (a, b, c, d, e, f) {
	// 	logDraw("Drew Item via draw");
	// 	return;
	// 	1 !== e && (ig.system.context.globalAlpha = e);
	// 	c = c || 0;
	// 	d = d || 0;
	// 	a = ig.system.O5949(a);
	// 	b = ig.system.O5949(b);
	// 	this.needsOffsetDuringDrag && (this.scaledWidth = this.img.width / 2 * ig.system.scale, a -= this.img.width / 4, b -= this.img.height / 2);
	// 	this.imagesGenerated && (c = this.getImageDataCanvasForDraw(c, d), this.O1455() ? ig.system.context.drawImage(c, 0, 0, this.scaledWidth, this.scaledHeight, a, b, this.scaledWidth, this.scaledHeight) : (c || console.log("rotated image data is null! - is this a non-rotatable item with rotation set?"), ig.system.context.drawImage(c, 0, 0, this.scaledWidth, this.scaledHeight, a,
	// 		b, this.scaledWidth, this.scaledHeight), f && (ig.system.context.globalAlpha = 1, ig.system.context.drawImage(c, f * this.scaledWidth, 0, this.scaledWidth, this.scaledHeight, a, b, this.scaledWidth, this.scaledHeight))));
	// 	1 !== e && (ig.system.context.globalAlpha = 1)
	// };
}));