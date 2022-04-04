import { Bindings } from "./bindings.js";
import { Interpolation } from "./interpolation.js";

export class Settings {
	static initialize() {
		Settings.load();
		Interpolation.onTick(Settings.onTick);
	}

	/**
	 * @private
	 */
	static onTick() {
		const speech = Bindings.ig.game.pl_player.pl_speech;
		if (speech) {
			for (const line of speech.pl_lines) {
				if (!line.moving) {
					const text = line.pl_text;
					const match = text.match(/(?<=^pl )(.*)(?=!$)/g);
					if (match) {
						const command = String(match).split(" ");
						/**
						 * @param {string} message
						 */
						function respond(message) {
							Bindings.ig.game.pl_player.say(message);
							line.moving = true;
						}
						if (command.length === 4 && command[0] === "set" && command[2] === "to") {
							const key = String(command[1]);
							const value = String(command[3]);
							if (key in Settings.template) {
								const typedKey = /** @type {keyof Settings.template}*/(key);
								if (
									/** @type {readonly string[]} */
									(Settings.template[typedKey])
										.indexOf(value) >= 0
								) {
									if (Settings.get(typedKey) === value) {
										respond(typedKey + " is already set to " + value);
									} else {
										Settings.set(typedKey, /** @type {any} */(value));
										respond(typedKey + " is now set to " + value);
									}
								} else {
									respond(
										typedKey +
										" can be: " +
										Settings.template[typedKey].join(", ")
									);
								}
							} else {
								respond(
									"you can set: " +
									Object.keys(Settings.template).join(", ")
								);
							}
							continue;
						}
						if (command.length === 2 && command[0] === "check") {
							const setting = String(command[1]);
							const value = /** @type {any} */(Settings.object)[setting];
							if (value === undefined) {
								respond(
									"you can check: " +
									Object.keys(Settings.template).join(", ")
								);
							} else {
								respond(setting + " is set to " + value);
							}
							continue;
						}
						respond("try: pl set [setting] to [value]! pl check [setting]! ");
					}
				}
			}
		}
	}

	/**
	 * @private
	 */
	static load() {
		const text = localStorage.getItem(Settings.storageKey);
		/** @type {Record<string, string>} */
		let loaded = {};
		try {
			loaded = JSON.parse(/** @type {any} */(text));
		} catch (e) { }
		if (!(loaded instanceof Object)) {
			loaded = {};
		}
		/** @type {Record<string, string>} */
		const result = {};
		for (const key in Settings.template) {
			const typedKey = /** @type {keyof Settings.template} */(key);
			let value = loaded[typedKey];
			if (Settings.template[typedKey].indexOf(/** @type {any} */(value)) === -1) {
				value = Settings.default[typedKey];
			}
			result[typedKey] = /** @type {string} */(value);
		}
	}

	/**
	 * @template {keyof SettingsObject} T
	 * @param {T} key 
	 * @param {SettingsObject[T]} value 
	 */
	static set(key, value) {
		Settings.object[key] = value;
		let isDefault = true;
		for (const key in Settings.default) {
			const typedKey = /** @type {keyof SettingsObject} */(key);
			if (Settings.object[typedKey] !== Settings.default[typedKey]) {
				isDefault = false;
				break;
			}
		}
		if (isDefault) {
			localStorage.removeItem(Settings.storageKey);
		} else {
			localStorage.setItem(Settings.storageKey, JSON.stringify(Settings.object));
		}
		Settings.load();
		const listeners = Settings.listeners[key];
		if (listeners) {
			for (const callback of listeners) {
				callback();
			}
		}
	}

	/**
	 * @param {keyof Settings.template} key 
	 * @param {() => void} callback 
	 */
	static onChange(key, callback) {
		let list = Settings.listeners[key];
		if (list === undefined) {
			list = Settings.listeners[key] = [];
		}
		list.push(callback);
	}

	/**
	 * @template {keyof SettingsObject} T
	 * @param {T} key 
	 */
	static get(key) {
		return Settings.object[key];
	}

	/**
	 * @private
	 */
	static storageKey = "plentyland_settings";

	/**
	 * @private
	 * @type {SettingsObject}
	 */
	static default = {
		graphics: "original",
		audio: "fixed"
	}

	static object = Object.assign({}, Settings.default);

	static template = /** @type {const} */({
		graphics: ["original", "fast"],
		audio: ["original", "fixed"]
	});

	/** @type {Record<string, (() => void)[]>} */
	static listeners = {};
}

/**
 * A type representing all valid values that fit the settings template.
 * @typedef {{
 * 		-readonly [T in keyof Settings.template]: Settings.template[T][number]
 * }} SettingsObject
 */