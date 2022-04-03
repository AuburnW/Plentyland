import { Bindings } from "./bindings.js";

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

export function initializeAudio() {
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