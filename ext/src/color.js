/**
 * Utility functions for manipulating colors.
 */
export class Color {
	static createRGBA() {
		return /** @type {Color.RGBA} */(new Uint8Array(4));
	}
}

/**
 * @typedef {Uint8Array & [red: number, green: number, blue: number, alpha: number]} Color.RGBA
 */