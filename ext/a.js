/** @type {any} */
var ig = /** @type {any} */ (window).ig;

(() => {
	try {
		const console = /** @type {any} */(window).consoleref;

		/**
		 * 
		 * @param {string} value 
		 */
		function say(value) {
			ig.game.O8006?.say(value);
		}

		// Check for duplication
		const sentinel = "/";
		if (ig[sentinel] === true) {
			say("plentyland is already active");
			return;
		}
		ig[sentinel] = true;
		say("plentyland active");

		if (!ig.Sound.enabled || !window.AudioContext) {
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

		// Process Sounds
		{
			/** @type {Map<string,Set<any>>} */
			const soundGroups = new Map();
			const sounds = ig.game.sounds;
			for (const name in sounds) {
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
							sound.group = group;
						}
					}
				}
			}
		}

		const audio = new AudioContext();

		// This node prevents sound from clipping
		const destination = new DynamicsCompressorNode(audio);
		destination.knee.value = 0;
		destination.ratio.value = 20;
		destination.attack.value = 0.003;
		destination.release.value = 1;
		destination.threshold.value = -6;
		destination.connect(audio.destination);

		// Reimplementation of ig.Sound

		const soundType = ig.Sound.prototype;
		/**
		 * @param {function(any): void} callback
		 */
		soundType.load = function (callback) {
			if (!this.playing) {
				Object.assign(this, {
					onLoad: null,
					buffer: null,
					loading: false,
					playing: new Set(),
				});
				const group = this.group;
				if (group) {
					group.delete(this);
					group.forEach(sound => {
						sound.group = null;
						sound.load();
					})
				}
			}
			if (this.buffer) {
				if (callback) { callback(this.path, true); }
			} else {
				if (!this.onLoad) {
					this.onLoad = [];
				}
				if (callback) {
					this.onLoad.push(callback);
				}
				if (!this.loading) {
					this.loading = true;
					const path = ig.prefix + this.path.replace(/[^\.]+$/, extension) + ig.nocache;
					fetch(path)
						.then(response => response.arrayBuffer())
						.then(data => audio.decodeAudioData(data))
						.then(buffer => {
							this.buffer = buffer;
							this.onLoad.forEach(
								callback => callback(this.path, true)
							);
							this.onLoad = null;
						})
						.catch(() => {
							this.loading = false;
							this.onLoad = null;
						});
				}
			}
		}
		soundType.play = function () {
			console.log(this.format);
			this.load(path => {
				const source = new AudioBufferSourceNode(audio);
				source.buffer = this.buffer;
				const gain = new GainNode(audio);
				gain.gain.value = this.volume * 0.5;
				source.connect(gain);
				gain.connect(destination);
				this.finalNode = gain;
				this.playing.add(gain);
				source.start();
				source.onended = () => {
					gain.disconnect();
					this.playing.delete(gain);
				};
				audio.resume();
			});
		}
		soundType.stop = function () {
			/** @type {any[]} */
			const playing = this.playing;
			if (playing) {
				playing.forEach(node => {
					node.disconnect();
				})
				playing.clear();
			}
		}
	} catch (error) { consoleref.error(error); throw error; }
})();