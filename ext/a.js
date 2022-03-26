if (window.plentyland) {
	throw new Error("Plentyland is already active!");
}

// Core functionality for Plentyland
ig.module("plugins.plentyland").requires(
	"game.main",
	"impact.sound"
).defines(() => {

	window.plentyland = ig.Class.extend({});

	/**
	 * Asserts that the given value is an instance of the given type, then returns the value.
	 * @param {any} value 
	 * @param {Function} type 
	 * @returns {any}
	 */
	function unwrap(value, type) {
		if (!(value instanceof type)) {
			throw new Error("Plentyland needs to update obfuscation bindings");
		}
		return value;
	}

	// Bindings for obfuscated code. These will need to be updated every time obfuscation changes.
	plentyland.player = unwrap(ig.game.O8006, ig.Entity);
	unwrap(plentyland.player.say, Function);
	plentyland.isWearing = "O7187";
	unwrap(plentyland.player[plentyland.isWearing], Function);
	plentyland.soundManagerClass = unwrap(ig.O1654, Function);
	plentyland.soundManager = unwrap(ig.O2212, plentyland.soundManagerClass);
	plentyland.brainManagerOnSound = unwrap(ig.game.brainManager.O5925, Function)
		.bind(ig.game.brainManager);

	// Finish

	plentyland.player.say("plentyland active");
});

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